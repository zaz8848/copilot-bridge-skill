import { config } from "./config.js";
import { getProjectChatId, setProjectChatId } from "./db.js";
import { createGroupChat, getP2pUserOpenId, sendPlainText } from "./feishu.js";

/**
 * 多项目自动建群路由：
 * - 项目名为空 / "unknown" / 在 SYSTEM_PROJECTS 列表 → 走单聊（兜底）
 * - 已建群 → 复用
 * - 未建群 → 自动建群、把用户拉进去、记 mapping、推一条欢迎文本
 */
const SYSTEM_PROJECTS = new Set(
    (process.env.BRIDGE_SINGLE_CHAT_PROJECTS ?? "Bridge")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
);

let cachedUserOpenId: string | null = null;
const inflight = new Map<string, Promise<string>>();

async function resolveUserOpenId(): Promise<string | null> {
    if (cachedUserOpenId) return cachedUserOpenId;
    if (!config.feishu.targetChatId) return null;
    cachedUserOpenId = await getP2pUserOpenId(config.feishu.targetChatId);
    if (cachedUserOpenId) {
        console.error(`[chats] cached user open_id=${cachedUserOpenId.slice(0, 8)}****`);
    } else {
        console.error(`[chats] WARN: 未能从单聊取到用户 open_id，自动建群将无法把你加进去`);
    }
    return cachedUserOpenId;
}

/**
 * 给定 project_name，返回应该往哪个 chat_id 发卡。
 * 必要时自动建群。失败则回落到单聊。
 */
export async function resolveProjectChatId(projectName: string): Promise<string> {
    const single = config.feishu.targetChatId;
    if (!projectName || projectName === "unknown" || SYSTEM_PROJECTS.has(projectName)) {
        return single;
    }
    const cached = getProjectChatId(projectName);
    if (cached) return cached;

    // 防止并发同一项目重复建群
    if (inflight.has(projectName)) {
        return inflight.get(projectName)!;
    }
    const p = (async () => {
        try {
            const userOpenId = await resolveUserOpenId();
            const userIds = userOpenId ? [userOpenId] : [];
            const chatId = await createGroupChat({ name: projectName, userOpenIds: userIds });
            setProjectChatId(projectName, chatId);
            // 群里推一条欢迎，告诉用户这是干嘛的
            await sendPlainText(
                chatId,
                `🎉 Copilot Bridge 为项目「${projectName}」自动创建本群。\n之后所有 ${projectName} 的通知 / 询问都会发到这里。\n回复方式：直接打字（不用带 #task_id），bridge 会路由到本群最近的待回复任务。`
            );
            return chatId;
        } catch (e) {
            console.error(`[chats] auto-create group fail for "${projectName}":`, e);
            // 回落到单聊
            return single;
        } finally {
            inflight.delete(projectName);
        }
    })();
    inflight.set(projectName, p);
    return p;
}
