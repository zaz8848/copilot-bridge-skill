import { config, maskSecret } from "./config.js";
import fs from "node:fs";
import path from "node:path";

interface TokenCache {
    token: string;
    expireAt: number; // ms epoch
}

let cache: TokenCache | null = null;

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

async function fetchTenantAccessToken(): Promise<TokenCache> {
    console.error(`[feishu] refreshing tenant_access_token`);
    const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            app_id: config.feishu.appId,
            app_secret: config.feishu.appSecret,
        }),
    });
    if (!res.ok) {
        throw new Error(`tenant_access_token http ${res.status}`);
    }
    const data = (await res.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number };
    if (data.code !== 0 || !data.tenant_access_token) {
        throw new Error(`tenant_access_token feishu code=${data.code} msg=${data.msg}`);
    }
    const expireAt = Date.now() + (data.expire ?? 7200) * 1000 - 5 * 60 * 1000; // -5min safety
    console.error(`[feishu] token ok ${maskSecret(data.tenant_access_token)} expire_in=${data.expire}s`);
    return { token: data.tenant_access_token, expireAt };
}

export async function getToken(): Promise<string> {
    if (!cache || Date.now() >= cache.expireAt) {
        cache = await fetchTenantAccessToken();
    }
    return cache.token;
}

async function feishuRequest(path: string, init: RequestInit, attempt = 1): Promise<any> {
    const token = await getToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
        ...((init.headers as Record<string, string>) ?? {}),
    };
    let res: Response;
    try {
        res = await fetch(`${FEISHU_BASE}${path}`, { ...init, headers });
    } catch (e) {
        if (attempt >= 3) throw e;
        const wait = 500 * Math.pow(2, attempt - 1);
        console.error(`[feishu] network err, retry in ${wait}ms attempt=${attempt}`);
        await new Promise((r) => setTimeout(r, wait));
        return feishuRequest(path, init, attempt + 1);
    }
    if (res.status >= 500 && attempt < 3) {
        const wait = 500 * Math.pow(2, attempt - 1);
        console.error(`[feishu] http ${res.status}, retry in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        return feishuRequest(path, init, attempt + 1);
    }
    const data = await res.json();
    // 99991663 / 99991661 = token expired -> refresh once
    if ((data as any).code === 99991663 || (data as any).code === 99991661) {
        cache = null;
        if (attempt < 3) return feishuRequest(path, init, attempt + 1);
    }
    return data;
}

export interface CardButton {
    label: string;
    value: string; // 点击后作为 reply 文本返回给 task
    style?: "default" | "primary" | "danger";
}

export interface SendCardOptions {
    taskId: string;
    projectName: string;
    message: string;
    level: "info" | "ask" | "done" | "error";
    buttons?: CardButton[]; // 可选：一键回复按钮
    chatId?: string; // 可选：覆盖默认 targetChatId，指向项目专属群
    imageKeys?: string[]; // 可选：在消息下方追加图片
}

const LEVEL_HEADER: Record<string, { template: string; title: string }> = {
    info: { template: "blue", title: "ℹ️ 通知" },
    ask: { template: "orange", title: "❓ 需要你回复" },
    done: { template: "green", title: "✅ 完成" },
    error: { template: "red", title: "❌ 出错" },
};

// BUGFIX B-04: lark_md 单 \n 不是换行，需 \n\n。这里昨动帮调用方准化：
//   - 单个 \n -> \n\n（段落）
//   - 已是 \n\n+ 不动
function normalizeMarkdownLineBreaks(text: string): string {
    return text.replace(/([^\n])\n(?!\n)/g, "$1\n\n");
}

export function buildCard(opts: SendCardOptions): Record<string, unknown> {
    const header = LEVEL_HEADER[opts.level] ?? LEVEL_HEADER.info;
    const elements: Array<Record<string, unknown>> = [
        { tag: "div", text: { tag: "lark_md", content: normalizeMarkdownLineBreaks(opts.message) } },
    ];
    if (opts.imageKeys && opts.imageKeys.length > 0) {
        for (const key of opts.imageKeys) {
            elements.push({
                tag: "img",
                img_key: key,
                alt: { tag: "plain_text", content: "image" },
                mode: "fit_horizontal",
            });
        }
    }
    if (opts.buttons && opts.buttons.length > 0) {
        elements.push({
            tag: "action",
            actions: opts.buttons.map((b) => ({
                tag: "button",
                text: { tag: "plain_text", content: b.label },
                type: b.style ?? "default",
                value: { task_id: opts.taskId, reply: b.value },
            })),
        });
    }
    elements.push({ tag: "hr" });
    elements.push({
        tag: "note",
        elements: [
            {
                tag: "plain_text",
                content: `task #${opts.taskId} · ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
            },
        ],
    });
    return {
        config: { wide_screen_mode: true },
        header: {
            template: header.template,
            title: { tag: "plain_text", content: `${header.title} · ${opts.projectName}` },
        },
        elements,
    };
}

export async function sendCard(opts: SendCardOptions): Promise<{ messageId: string }> {
    if (config.mock) {
        const fakeId = `om_mock_${opts.taskId}_${Date.now()}`;
        console.error(`[feishu:MOCK] would send card task=${opts.taskId} msg="${opts.message.slice(0, 60)}..." -> ${fakeId}`);
        return { messageId: fakeId };
    }
    const targetChat = opts.chatId || config.feishu.targetChatId;
    if (!targetChat) {
        throw new Error("FEISHU_TARGET_CHAT_ID 未配置：先在飞书发起单聊，再跑 pnpm --filter bridge-core get-chat-id");
    }
    const card = buildCard(opts);

    const data = await feishuRequest(`/im/v1/messages?receive_id_type=chat_id`, {
        method: "POST",
        body: JSON.stringify({
            receive_id: targetChat,
            msg_type: "interactive",
            content: JSON.stringify(card),
        }),
    });

    if (data.code !== 0) {
        throw new Error(`feishu send card code=${data.code} msg=${data.msg}`);
    }
    const messageId = data.data?.message_id as string;
    console.error(`[feishu] sent card task=${opts.taskId} message_id=${maskSecret(messageId)}`);
    return { messageId };
}

/**
 * 取消息文本（事件回调里 content 是 JSON 字符串）
 */
export function parseTextFromEventContent(content: string): string {
    try {
        const obj = JSON.parse(content);
        return (obj.text as string) ?? "";
    } catch {
        return "";
    }
}

export async function listSelfChats(): Promise<Array<{ chat_id: string; name: string; chat_mode: string }>> {
    const data = await feishuRequest(`/im/v1/chats?page_size=100`, { method: "GET" });
    if (data.code !== 0) throw new Error(`list chats code=${data.code} msg=${data.msg}`);
    return data.data?.items ?? [];
}

/** 从 p2p 单聊 chat_id 取对方（非机器人）的 open_id */
export async function getP2pUserOpenId(p2pChatId: string): Promise<string | null> {
    const data = await feishuRequest(
        `/im/v1/chats/${p2pChatId}/members?member_id_type=open_id&page_size=20`,
        { method: "GET" }
    );
    if (data.code !== 0) {
        console.error(`[feishu] get p2p members fail code=${data.code} msg=${data.msg}`);
        return null;
    }
    const items = (data.data?.items ?? []) as Array<{ member_id: string; name?: string }>;
    if (items.length === 0) return null;
    // p2p 中两方：机器人自己 + 用户。这里 API 返回的 是对方。取第一个。
    return items[0].member_id;
}

/** 创建群聊并把指定用户拉进去，返回 chat_id */
export async function createGroupChat(opts: {
    name: string;
    userOpenIds: string[];
    description?: string;
}): Promise<string> {
    console.error(`[feishu] creating group chat name="${opts.name}" users=${opts.userOpenIds.length}`);
    const data = await feishuRequest(`/im/v1/chats?set_bot_manager=true&user_id_type=open_id`, {
        method: "POST",
        body: JSON.stringify({
            name: opts.name,
            description: opts.description ?? `Copilot Bridge 项目专属群 · ${opts.name}`,
            user_id_list: opts.userOpenIds,
            chat_mode: "group",
            chat_type: "private",
            external: false,
            join_message_visibility: "only_owner",
            leave_message_visibility: "only_owner",
            membership_approval: "no_approval_required",
        }),
    });
    if (data.code !== 0) {
        throw new Error(`create chat code=${data.code} msg=${data.msg}`);
    }
    const chatId = data.data?.chat_id as string;
    console.error(`[feishu] group created chat_id=${chatId}`);
    return chatId;
}

/** 上传一张本地图片到飞书，返回 image_key（用于 outbound 卡片 img 元素） */
export async function uploadImage(filePath: string): Promise<string> {
    if (config.mock) {
        const fakeKey = `img_mock_${path.basename(filePath)}_${Date.now()}`;
        console.error(`[feishu:MOCK] would upload image ${filePath} -> ${fakeKey}`);
        return fakeKey;
    }
    const buf = await fs.promises.readFile(filePath);
    const fd = new FormData();
    fd.set("image_type", "message");
    fd.set("image", new Blob([new Uint8Array(buf)]), path.basename(filePath));
    let res: Response;
    let attempt = 1;
    while (true) {
        try {
            const token = await getToken();
            res = await fetch(`${FEISHU_BASE}/im/v1/images`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd as any,
            });
            if (res.status >= 500 && attempt < 3) {
                attempt++;
                await new Promise((r) => setTimeout(r, 500 * attempt));
                continue;
            }
            break;
        } catch (e) {
            if (attempt >= 3) throw e;
            attempt++;
            await new Promise((r) => setTimeout(r, 500 * attempt));
        }
    }
    const data = (await res!.json()) as { code: number; msg: string; data?: { image_key: string } };
    if (data.code !== 0 || !data.data?.image_key) {
        throw new Error(`upload image code=${data.code} msg=${data.msg}`);
    }
    console.error(`[feishu] uploaded image ${path.basename(filePath)} -> ${maskSecret(data.data.image_key)}`);
    return data.data.image_key;
}

/** 嗅 magic bytes 判断真实图片类型，返回扩展名（不含点） */
function sniffImageExt(buf: Buffer): string {
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
    if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
    if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "webp";
    return "png"; // 兜底
}

/** 下载用户在 inbound 消息里发的图片到本地。会按 magic bytes 嗅真实类型并改扩展名，返回最终保存路径 */
export async function downloadInboundImage(messageId: string, fileKey: string, savePath: string): Promise<string> {
    const token = await getToken();
    const res = await fetch(
        `${FEISHU_BASE}/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}?type=image`,
        { method: "GET", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
        throw new Error(`download image http ${res.status}`);
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const ext = sniffImageExt(buf);
    // 把 savePath 末尾的扩展名换成嗅出来的真实类型
    const dir = path.dirname(savePath);
    const baseNoExt = path.basename(savePath).replace(/\.[^.]+$/, "");
    const finalPath = path.join(dir, `${baseNoExt}.${ext}`);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(finalPath, buf);
    console.error(`[feishu] downloaded inbound image ${maskSecret(fileKey)} -> ${finalPath} (${ab.byteLength}B, sniff=${ext})`);
    return finalPath;
}

/** 吐一句纯文本到指定 chat。返回 message_id（mock 模式返回伪 id）。
 *  支持可选 imageKeys：会先发文本，再依次发独立的图片消息（飞书 text 消息无法直接嵌图）。
 *  返回的 messageId 是文本消息的 id，用于绑定 task 做 reply 路由。
 */
export async function sendPlainText(
    chatId: string,
    text: string,
    imageKeys?: string[]
): Promise<{ messageId: string }> {
    if (config.mock) {
        const fake = `om_mock_text_${Date.now()}`;
        console.error(`[feishu:MOCK] would send text to ${chatId}: ${text.slice(0, 80)} -> ${fake}`);
        return { messageId: fake };
    }
    const data = await feishuRequest(`/im/v1/messages?receive_id_type=chat_id`, {
        method: "POST",
        body: JSON.stringify({
            receive_id: chatId,
            msg_type: "text",
            content: JSON.stringify({ text }),
        }),
    });
    if (data.code !== 0) {
        console.error(`[feishu] sendPlainText fail code=${data.code} msg=${data.msg}`);
        throw new Error(`sendPlainText fail code=${data.code} msg=${data.msg}`);
    }
    const messageId = String(data?.data?.message_id ?? "");
    // 可选：附带图片，按顺序逐张发独立的 image 消息
    if (imageKeys && imageKeys.length > 0) {
        for (const key of imageKeys) {
            try {
                await feishuRequest(`/im/v1/messages?receive_id_type=chat_id`, {
                    method: "POST",
                    body: JSON.stringify({
                        receive_id: chatId,
                        msg_type: "image",
                        content: JSON.stringify({ image_key: key }),
                    }),
                });
            } catch (e: any) {
                console.error(`[feishu] sendPlainText image attach fail key=${key}:`, e?.message ?? e);
            }
        }
    }
    return { messageId };
}
