import {
    getTaskByFeishuMessageId,
    getTaskByTaskId,
    getLatestPendingTask,
    getLatestPendingTaskByChat,
    setTaskReplied,
    isEventProcessed,
    markEventProcessed,
    appendPendingReply,
    listProjectChats,
} from "./db.js";
import { resolveWaiter } from "./waiters.js";
import { parseTextFromEventContent, sendPlainText, downloadInboundImage } from "./feishu.js";
import { config } from "./config.js";
import path from "node:path";

interface FeishuEvent {
    schema?: string;
    header?: {
        event_id: string;
        event_type: string;
        create_time: string;
    };
    event?: {
        sender?: { sender_id?: { open_id?: string } };
        message?: {
            message_id: string;
            root_id?: string;
            parent_id?: string;
            chat_id: string;
            content: string; // JSON string
            message_type: string;
        };
        // 卡片按钮点击事件（card.action.trigger）下会带 action.value
        action?: {
            value?: { task_id?: string; reply?: string } & Record<string, unknown>;
            tag?: string;
        };
    };
}

const TASK_ID_PATTERN = /#([a-zA-Z0-9]{4,12})/;

// 图片暂存：图片单独到达时不立即 resolve 卡，等同 task 后续文字一起交付
// 用户约定：发了图片之后一定会发文字，bridge 一直等
const imageBuffer = new Map<string, string[]>();

// 文字暂存：文字单独到达时不立即 resolve，给 1.5s 等可能跟来的图片
// 命中时合并图+文一起 resolve；超时则按纯文字 resolve
const TEXT_GRACE_MS = 1500;
interface PendingText { text: string; timer: NodeJS.Timeout; }
const textBuffer = new Map<string, PendingText>();

function projectFromChatId(chatId: string): string | undefined {
    return listProjectChats().find((r) => r.chat_id === chatId)?.project_name;
}

export function clearImageBuffer(taskId: string): void {
    imageBuffer.delete(taskId);
    const pt = textBuffer.get(taskId);
    if (pt) { clearTimeout(pt.timer); textBuffer.delete(taskId); }
}

export function handleIncomingEvent(body: FeishuEvent): void {
    void handleIncomingEventAsync(body).catch((e) => console.error(`[router] async err:`, e));
}

async function handleIncomingEventAsync(body: FeishuEvent): Promise<void> {
    const eventId = body.header?.event_id;
    if (!eventId) {
        console.error(`[router] event without event_id, ignored`);
        return;
    }
    if (isEventProcessed(eventId)) {
        console.error(`[router] duplicate event ${eventId}, ignored`);
        return;
    }
    markEventProcessed(eventId);

    const evType = body.header?.event_type;

    // 卡片按钮点击：event_type=card.action.trigger
    if (evType === "card.action.trigger") {
        const action = body.event?.action;
        const taskId = action?.value?.task_id;
        const reply = action?.value?.reply;
        if (!taskId || !reply) {
            console.error(`[router] card.action.trigger missing task_id/reply, ignored`);
            return;
        }
        const task = getTaskByTaskId(taskId);
        if (!task) {
            console.error(`[router] card.action.trigger task ${taskId} not found, ignored`);
            return;
        }
        if (task.status !== "pending") {
            console.error(`[router] card.action.trigger task ${taskId} already ${task.status}, ignored`);
            return;
        }
        setTaskReplied(taskId, reply);
        const delivered = resolveWaiter(taskId, reply);
        clearImageBuffer(taskId);
        if (!delivered) {
            // 没有活跃 waiter（MCP wait 被取消 / 进程死过）→ 镜像写进 pending_replies，resume 能拉到
            if (task.chat_id) {
                appendPendingReply(task.chat_id, task.project_name, reply, taskId);
                console.error(`[router] no active waiter for task ${taskId}, mirrored button reply to pending_replies`);
            } else {
                console.error(`[router] no active waiter for task ${taskId}, skip pending_replies mirror because chat_id is empty`);
            }
        }
        console.error(`[router] routed button -> task ${taskId} reply="${reply}" project=${task.project_name}`);
        return;
    }

    if (evType !== "im.message.receive_v1") {
        console.error(`[router] event_type=${evType} ignored`);
        return;
    }
    const msg = body.event?.message;
    if (!msg) return;
    let text = "";
    let isImage = false;
    if (msg.message_type === "text") {
        text = parseTextFromEventContent(msg.content).trim();
        if (!text) return;
    } else if (msg.message_type === "image") {
        isImage = true;
        // 下载到本地，把路径作为 markdown 文本塞进去；AI 后续可调 view_image 看图
        let imageKey = "";
        try {
            const obj = JSON.parse(msg.content);
            imageKey = String(obj.image_key ?? "");
        } catch {
            console.error(`[router] image content parse fail: ${msg.content}`);
            return;
        }
        if (!imageKey) {
            console.error(`[router] image without image_key, ignored`);
            return;
        }
        const ts = Date.now();
        const safeKey = imageKey.replace(/[^a-zA-Z0-9_]/g, "_");
        const fileName = `inbound_${ts}_${safeKey}.png`;
        const savePath = path.join(config.paths.images, fileName);
        let finalPath: string;
        try {
            finalPath = await downloadInboundImage(msg.message_id, imageKey, savePath);
        } catch (e: any) {
            console.error(`[router] download inbound image fail:`, e?.message ?? e);
            return;
        }
        // 用绝对路径让 AI 不管在哪个 workspace 都能 view_image 打开（bug D 修复）
        const absPath = finalPath.replace(/\\/g, "/");
        text = `[图片](${absPath})`;
    } else {
        console.error(`[router] unsupported message_type=${msg.message_type} ignored`);
        return;
    }

    // 1) 优先用引用回复匹配
    let task =
        (msg.parent_id && getTaskByFeishuMessageId(msg.parent_id)) ||
        (msg.root_id && getTaskByFeishuMessageId(msg.root_id)) ||
        undefined;

    // 2) 用 #task_id 匹配
    if (!task) {
        const m = text.match(TASK_ID_PATTERN);
        if (m) {
            task = getTaskByTaskId(m[1]);
        }
    }

    // 3) 兜底：本群最近一条 pending；没命中再走全局最新
    if (!task) {
        task = getLatestPendingTaskByChat(msg.chat_id) || getLatestPendingTask();
    }

    if (!task) {
        // 没有任何 pending 任务可路由 → 当成离线消息存进 pending_replies，
        // AI 下次启动调 /api/resume 时一次性收回
        const projectName = projectFromChatId(msg.chat_id) ?? "unknown";
        appendPendingReply(msg.chat_id, projectName, text, null);
        sendPlainText(
            msg.chat_id,
            `收到了，AI 当前不在线。已存进收件箱，它下次出现时会一并处理。`
        ).catch((e) => console.error(`[router] offline ack send fail:`, e));
        console.error(`[router] no pending task -> pending_replies project=${projectName}`);
        return;
    }
    if (task.status !== "pending") {
        console.error(`[router] task ${task.task_id} already ${task.status}, queued to pending_replies`);
        const refMatched = !!(
            (msg.parent_id && getTaskByFeishuMessageId(msg.parent_id)) ||
            (msg.root_id && getTaskByFeishuMessageId(msg.root_id))
        );
        appendPendingReply(
            msg.chat_id,
            task.project_name,
            text,
            refMatched ? task.task_id : null
        );
        sendPlainText(
            msg.chat_id,
            `收到。卡片 #${task.task_id} 已经处理过，这条当成新追加任务存进收件箱，AI 下次接力时一并处理。`
        ).catch((e) => console.error(`[router] queued ack send fail:`, e));
        return;
    }

    // 去掉文本里的 #task_id 标记，让 reply 干净
    // BUGFIX B-05: nanoid 字符集不含 `-`，但即便如此也兜底剥掉收尾连字符 / 空白
    const cleanText = text.replace(TASK_ID_PATTERN, "").replace(/^[\s\-]+|[\s\-]+$/g, "") || text;

    // 用户约定（v0.0.10）：图片单独到达时不立即 resolve 卡，缓冲等后续文字
    // 文字到达时把同 task 的所有缓冲图片 prepend 进 reply，再 resolve
    if (isImage) {
        const buf = imageBuffer.get(task.task_id) ?? [];
        buf.push(cleanText);
        imageBuffer.set(task.task_id, buf);
        // 若已有正在等图的文字 → 立刻合并 resolve
        const pendingText = textBuffer.get(task.task_id);
        if (pendingText) {
            clearTimeout(pendingText.timer);
            textBuffer.delete(task.task_id);
            const merged = buf.join("\n") + "\n" + pendingText.text;
            imageBuffer.delete(task.task_id);
            console.error(`[router] text waited, image arrived -> merged ${buf.length} image(s) into task ${task.task_id} reply`);
            finalizeReply(task, merged);
            return;
        }
        console.error(`[router] buffered image for task ${task.task_id} (count=${buf.length}), waiting for text`);
        return;
    }

    const buffered = imageBuffer.get(task.task_id);
    if (buffered && buffered.length > 0) {
        const merged = buffered.join("\n") + "\n" + cleanText;
        imageBuffer.delete(task.task_id);
        console.error(`[router] merged ${buffered.length} buffered image(s) into task ${task.task_id} reply`);
        finalizeReply(task, merged);
        return;
    }

    // 没有缓冲图片：给 1.5s 宽限，等可能跟来的图片再合并
    const old = textBuffer.get(task.task_id);
    if (old) clearTimeout(old.timer);
    const timer = setTimeout(() => {
        textBuffer.delete(task.task_id);
        console.error(`[router] text grace timeout, resolving task ${task.task_id} as text-only`);
        finalizeReply(task, cleanText);
    }, TEXT_GRACE_MS);
    textBuffer.set(task.task_id, { text: cleanText, timer });
    console.error(`[router] buffered text for task ${task.task_id}, waiting ${TEXT_GRACE_MS}ms for image`);
}

function finalizeReply(task: { task_id: string; chat_id: string | null; project_name: string }, finalText: string): void {
    setTaskReplied(task.task_id, finalText);
    const delivered = resolveWaiter(task.task_id, finalText);
    if (!delivered) {
        // 没有活跃 waiter（MCP wait 被取消 / 进程死过）→ 镜像写进 pending_replies，resume 能拉到
        if (task.chat_id) {
            appendPendingReply(task.chat_id, task.project_name, finalText, task.task_id);
            console.error(`[router] no active waiter for task ${task.task_id}, mirrored reply to pending_replies`);
        } else {
            console.error(`[router] no active waiter for task ${task.task_id}, skip pending_replies mirror because chat_id is empty`);
        }
    }
    console.error(`[router] routed reply -> task ${task.task_id} project=${task.project_name}`);
}
