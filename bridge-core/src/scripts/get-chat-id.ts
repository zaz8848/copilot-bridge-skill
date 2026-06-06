/**
 * 帮你拿当前账号下所有 chat 列表，挑那个 chat_mode=p2p（单聊）的 chat_id 填进 .env
 * 用法: pnpm --filter bridge-core get-chat-id
 */
import { listSelfChats } from "../feishu.js";
import { logConfigSafe } from "../config.js";

async function main() {
    logConfigSafe();
    const chats = await listSelfChats();
    if (chats.length === 0) {
        console.error("[get-chat-id] 一个 chat 都没有。请在飞书里跟你的机器人发起一次单聊（任意一句话），然后再跑本命令。");
        process.exit(1);
    }
    console.error(`[get-chat-id] found ${chats.length} chats:`);
    for (const c of chats) {
        console.log(`  chat_id=${c.chat_id}  mode=${(c as any).chat_mode ?? "?"}  name=${c.name ?? ""}`);
    }
    console.error("\n挑那个 mode=p2p 的 chat_id，填进 .env 的 FEISHU_TARGET_CHAT_ID");
}

main().catch((e) => {
    console.error("[get-chat-id] err:", e);
    process.exit(1);
});
