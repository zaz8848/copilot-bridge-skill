import express, { type Request, type Response } from "express";
import { nanoid } from "nanoid";
import path from "node:path";
import fs from "node:fs";
import { config, logConfigSafe } from "./config.js";
import { initDb, insertTask, setTaskFeishuMessageId, getTaskByTaskId, sweepExpired, closeDb, drainPendingReplies } from "./db.js";
import { sendCard, uploadImage, sendPlainText, type CardButton } from "./feishu.js";
import { resolveProjectChatId } from "./chats.js";
import { handleIncomingEvent } from "./router.js";
import { registerWaiter } from "./waiters.js";
import { mountConsole } from "./console.js";
import { mountDashboard } from "./dashboard.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// ---- 健康检�?----
app.get("/health", (_req, res) => {
    res.json({ ok: true, version: "0.0.12", time: new Date().toISOString() });
});

// 本地 console 兜底通信
mountConsole(app);

// 本地运维 dashboard（127.0.0.1 only，公网 ingress 不放）
mountDashboard(app);

// ---- 飞书事件回调 ----
app.post("/webhook/feishu", (req: Request, res: Response) => {
    const body = req.body ?? {};

    // 1) URL 验证 (首次配置事件订阅地址时飞书会发这�?
    if (body.type === "url_verification" && typeof body.challenge === "string") {
        console.error(`[webhook] url_verification ok`);
        res.json({ challenge: body.challenge });
        return;
    }

    // 2) verification token 校验（可选）
    if (config.feishu.verificationToken) {
        const incoming = body?.header?.token ?? body?.token;
        if (incoming && incoming !== config.feishu.verificationToken) {
            console.error(`[webhook] verification token 不匹配，拒绝`);
            res.status(401).json({ error: "invalid token" });
            return;
        }
    }

    // 3) 正常事件 �?必须 3 秒内 200，先 ack 再异步处�?
    res.status(200).json({ code: 0, msg: "ok" });

    setImmediate(() => {
        try {
            handleIncomingEvent(body);
        } catch (e) {
            console.error(`[webhook] handler err:`, e);
        }
    });
});

// ---- MCP 客户�?API: 推送通知 ----
interface NotifyReq {
    message: string;
    level?: "info" | "ask" | "done" | "error";
    project_name?: string;
    workspace_path?: string;
    task_id?: string;
    ttl_seconds?: number;
    buttons?: CardButton[]; // 可选：一键回复按�?
    image_paths?: string[]; // 可选：本地图片绝对路径数组，会依次上传并附在消息下�?
}

async function uploadImagesIfAny(image_paths: string[] | undefined): Promise<string[] | undefined> {
    if (!image_paths || image_paths.length === 0) return undefined;
    const keys: string[] = [];
    for (const p of image_paths) {
        try {
            keys.push(await uploadImage(p));
        } catch (e: any) {
            console.error(`[api] uploadImage fail path=${p}:`, e?.message ?? e);
            throw new Error(`upload image fail: ${p}: ${e?.message ?? e}`);
        }
    }
    return keys;
}

const VALID_LEVELS = new Set(["info", "ask", "done", "error"]);
function normalizeLevel(level: string | undefined, fallback: "info" | "ask"): "info" | "ask" | "done" | "error" {
    if (level && !VALID_LEVELS.has(level)) {
        console.error(`[api] unknown level="${level}", falling back to ${fallback}. valid: info|ask|done|error`);
    }
    return (level && VALID_LEVELS.has(level) ? level : fallback) as any;
}

app.post("/api/notify", async (req: Request, res: Response) => {
    try {
        const body = req.body as NotifyReq;
        if (!body?.message || typeof body.message !== "string") {
            res.status(400).json({ error: "message required" });
            return;
        }
        const taskId = body.task_id ?? nanoid(6).toLowerCase();
        const projectName =
            body.project_name?.trim() ||
            (body.workspace_path ? path.basename(body.workspace_path) : "unknown");
        const ttl = Math.max(60, Math.min(body.ttl_seconds ?? 7 * 24 * 3600, 30 * 24 * 3600)) /* Ĭ�� 7 �죬� 30 �� */;
        const level = normalizeLevel(body.level, "info");
        const now = Date.now();
        const chatId = await resolveProjectChatId(projectName);

        insertTask({
            task_id: taskId,
            workspace_path: body.workspace_path ?? "",
            project_name: projectName,
            message: body.message,
            level,
            status: "pending",
            chat_id: chatId,
            created_at: now,
            expired_at: now + ttl * 1000,
        });

        const imageKeys = await uploadImagesIfAny(body.image_paths);
        const { messageId } = await sendCard({
            taskId,
            projectName,
            message: body.message,
            level,
            buttons: body.buttons,
            chatId,
            imageKeys,
        });
        setTaskFeishuMessageId(taskId, messageId);
        res.json({ task_id: taskId, feishu_message_id: messageId });
    } catch (e: any) {
        console.error(`[api/notify] err:`, e);
        res.status(500).json({ error: e?.message ?? String(e) });
    }
});

// ---- MCP 客户�?API: 长轮询等回复 ----
app.get("/api/wait/:taskId", (req: Request, res: Response) => {
    const taskId = req.params.taskId;
    const timeoutSec = Math.max(1, Math.min(parseInt(String(req.query.timeout ?? "600"), 10) || 600, 86400));

    const task = getTaskByTaskId(taskId);
    if (!task) {
        res.status(404).json({ error: "task not found" });
        return;
    }
    // 任务已经被回�?-> 立即返回
    if (task.status === "replied" && task.reply_text) {
        res.json({ task_id: taskId, reply: task.reply_text, replied_at: task.reply_at });
        return;
    }
    if (task.status !== "pending") {
        res.status(410).json({ error: `task ${task.status}` });
        return;
    }

    let done = false;
    const cancel = registerWaiter(
        taskId,
        timeoutSec * 1000,
        (text) => {
            if (done) return;
            done = true;
            res.json({ task_id: taskId, reply: text, replied_at: Date.now() });
        },
        () => {
            if (done) return;
            done = true;
            // BUGFIX B-02: 长轮询超时不�?setTaskExpired，task �?pending�?
            // 让用户后到的回复仍能命中；真正的过期�?ttl_seconds + sweepExpired 负责�?
            res.status(408).json({ error: "timeout", task_id: taskId });
        }
    );

    // 客户端断开 -> 取消挂起
    req.on("close", () => {
        if (!done) {
            done = true;
            cancel();
        }
    });
});

// ---- MCP 客户�?API: 一次完�?notify+wait ----
app.post("/api/notify-and-wait", async (req: Request, res: Response) => {
    try {
        const body = req.body as NotifyReq & { timeout_seconds?: number };
        if (!body?.message) {
            res.status(400).json({ error: "message required" });
            return;
        }
        // timeout_seconds = 0 / 未提�?�?永不超时（HTTP 长挂直到回复或客户端断开�?
        // 显式传正�?�?启用超时（保留兼容老调用）
        const explicitTimeout = typeof body.timeout_seconds === "number" && body.timeout_seconds > 0;
        const timeoutSec = explicitTimeout
            ? Math.max(1, Math.min(body.timeout_seconds!, 7 * 24 * 3600))
            : 0;
        const expiredAt = explicitTimeout
            ? Date.now() + timeoutSec * 1000
            : Date.now() + 365 * 24 * 3600 * 1000; // 长挂�?task 行设 1 年过�?
        const taskId = body.task_id ?? nanoid(6).toLowerCase();
        const projectName =
            body.project_name?.trim() ||
            (body.workspace_path ? path.basename(body.workspace_path) : "unknown");
        const level = normalizeLevel(body.level, "ask");
        const chatId = await resolveProjectChatId(projectName);

        insertTask({
            task_id: taskId,
            workspace_path: body.workspace_path ?? "",
            project_name: projectName,
            message: body.message,
            level,
            status: "pending",
            chat_id: chatId,
            created_at: Date.now(),
            expired_at: expiredAt,
        });

        const imageKeys = await uploadImagesIfAny(body.image_paths);
        const { messageId } = await sendCard({
            taskId,
            projectName,
            message: body.message,
            level,
            buttons: body.buttons,
            chatId,
            imageKeys,
        });
        setTaskFeishuMessageId(taskId, messageId);

        let done = false;
        const cancel = registerWaiter(
            taskId,
            timeoutSec * 1000, // 0 = 永不超时
            (text) => {
                if (done) return;
                done = true;
                res.json({ task_id: taskId, reply: text, replied_at: Date.now() });
            },
            () => {
                if (done) return;
                done = true;
                res.status(408).json({ error: "timeout", task_id: taskId });
            }
        );
        req.on("close", () => {
            if (!done) {
                done = true;
                cancel();
            }
        });
    } catch (e: any) {
        console.error(`[api/notify-and-wait] err:`, e);
        res.status(500).json({ error: e?.message ?? String(e) });
    }
});

// ---- MCP 客户�?API: chat —�?纯文本，不发�?----
app.post("/api/chat", async (req: Request, res: Response) => {
    try {
        const body = req.body as NotifyReq;
        if (!body?.message || typeof body.message !== "string") {
            res.status(400).json({ error: "message required" });
            return;
        }
        const taskId = body.task_id ?? nanoid(6).toLowerCase();
        const projectName =
            body.project_name?.trim() ||
            (body.workspace_path ? path.basename(body.workspace_path) : "unknown");
        const ttl = Math.max(60, Math.min(body.ttl_seconds ?? 7 * 24 * 3600, 30 * 24 * 3600)) /* Ĭ�� 7 �죬� 30 �� */;
        const level = normalizeLevel(body.level, "info");
        const now = Date.now();
        const chatId = await resolveProjectChatId(projectName);

        insertTask({
            task_id: taskId,
            workspace_path: body.workspace_path ?? "",
            project_name: projectName,
            message: body.message,
            level,
            status: "pending",
            chat_id: chatId,
            created_at: now,
            expired_at: now + ttl * 1000,
        });

        const imageKeys = await uploadImagesIfAny(body.image_paths);
        const { messageId } = await sendPlainText(chatId, body.message, imageKeys);
        setTaskFeishuMessageId(taskId, messageId);
        res.json({ task_id: taskId, feishu_message_id: messageId });
    } catch (e: any) {
        console.error(`[api/chat] err:`, e);
        res.status(500).json({ error: e?.message ?? String(e) });
    }
});

// ---- MCP 客户�?API: chat-wait —�?纯文�?+ 等回�?----
app.post("/api/chat-wait", async (req: Request, res: Response) => {
    try {
        const body = req.body as NotifyReq & { timeout_seconds?: number };
        if (!body?.message) {
            res.status(400).json({ error: "message required" });
            return;
        }
        const explicitTimeout = typeof body.timeout_seconds === "number" && body.timeout_seconds > 0;
        const timeoutSec = explicitTimeout
            ? Math.max(1, Math.min(body.timeout_seconds!, 7 * 24 * 3600))
            : 0;
        const expiredAt = explicitTimeout
            ? Date.now() + timeoutSec * 1000
            : Date.now() + 365 * 24 * 3600 * 1000;
        const taskId = body.task_id ?? nanoid(6).toLowerCase();
        const projectName =
            body.project_name?.trim() ||
            (body.workspace_path ? path.basename(body.workspace_path) : "unknown");
        const level = normalizeLevel(body.level, "ask");
        const chatId = await resolveProjectChatId(projectName);

        insertTask({
            task_id: taskId,
            workspace_path: body.workspace_path ?? "",
            project_name: projectName,
            message: body.message,
            level,
            status: "pending",
            chat_id: chatId,
            created_at: Date.now(),
            expired_at: expiredAt,
        });

        const imageKeys = await uploadImagesIfAny(body.image_paths);
        const { messageId } = await sendPlainText(chatId, body.message, imageKeys);
        setTaskFeishuMessageId(taskId, messageId);

        let done = false;
        const cancel = registerWaiter(
            taskId,
            timeoutSec * 1000,
            (text) => {
                if (done) return;
                done = true;
                res.json({ task_id: taskId, reply: text, replied_at: Date.now() });
            },
            () => {
                if (done) return;
                done = true;
                res.status(408).json({ error: "timeout", task_id: taskId });
            }
        );
        req.on("close", () => {
            if (!done) {
                done = true;
                cancel();
            }
        });
    } catch (e: any) {
        console.error(`[api/chat-wait] err:`, e);
        res.status(500).json({ error: e?.message ?? String(e) });
    }
});

// ---- MCP 客户�?API: resume —�?拉取本项目所有未消费的飞书回�?----
// AI 启动 / 醒来时第一件事调，�?我不在时用户说的�?一次性收�?
app.post("/api/resume", async (req: Request, res: Response) => {
    try {
        const body = req.body as { project_name?: string; workspace_path?: string };
        const projectName =
            body.project_name?.trim() ||
            (body.workspace_path ? path.basename(body.workspace_path) : "");
        if (!projectName) {
            res.status(400).json({ error: "project_name or workspace_path required" });
            return;
        }
        const rows = drainPendingReplies(projectName);
        console.error(`[api/resume] project=${projectName} drained=${rows.length}`);
        res.json({
            project_name: projectName,
            count: rows.length,
            replies: rows.map((r) => ({
                id: r.id,
                text: r.text,
                parent_task_id: r.parent_task_id,
                received_at: r.received_at,
            })),
        });
    } catch (e: any) {
        console.error(`[api/resume] err:`, e);
        res.status(500).json({ error: e?.message ?? String(e) });
    }
});

// ---- 启动 ----
function start() {
    logConfigSafe();
    initDb();

    // 确保 images 目录存在
    try {
        fs.mkdirSync(config.paths.images, { recursive: true });
    } catch { }

    // 单例锁：监听端口失败说明已经有一�?core 在跑
    const server = app.listen(config.bridge.port, "127.0.0.1", () => {
        console.error(`[bridge] listening on http://127.0.0.1:${config.bridge.port}`);
        console.error(`[bridge] feishu webhook path: /webhook/feishu`);
        console.error(`[bridge] local console:       /console`);
        if (config.mock) console.error(`[bridge] FEISHU_MOCK=1 不调真飞�?API`);
    });
    server.on("error", (e: any) => {
        if (e?.code === "EADDRINUSE") {
            console.error(
                `[bridge] FATAL: 端口 ${config.bridge.port} 已被占用。可能已有一�?bridge core 在跑。`
            );
            process.exit(2);
        }
        console.error(`[bridge] server err:`, e);
        process.exit(3);
    });

    // 后台扫除：每 60 秒跑一�?
    const sweepTimer = setInterval(() => {
        try {
            const r = sweepExpired();
            if (r.tasksExpired > 0 || r.eventsCleared > 0) {
                console.error(`[sweep] tasks_expired=${r.tasksExpired} events_cleared=${r.eventsCleared}`);
            }
        } catch (e) {
            console.error(`[sweep] err:`, e);
        }
    }, 60_000);
    sweepTimer.unref();

    // Graceful shutdown
    let shuttingDown = false;
    const shutdown = (sig: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.error(`[bridge] ${sig} received, shutting down...`);
        server.close(() => {
            closeDb();
            console.error(`[bridge] bye`);
            process.exit(0);
        });
        setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    process.on("uncaughtException", (e) => console.error(`[bridge] uncaught:`, e));
    process.on("unhandledRejection", (e) => console.error(`[bridge] unhandledRejection:`, e));
}

start();
