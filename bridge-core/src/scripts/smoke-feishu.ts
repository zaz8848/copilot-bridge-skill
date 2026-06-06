/**
 * 真飞书烟雾测试：不依赖 chat_id，仅验证 App ID/Secret 能否拿到 tenant_access_token
 * 用法: pnpm --filter bridge-core smoke-feishu
 */
import { getToken } from "../feishu.js";
import { config, maskSecret } from "../config.js";

async function main() {
    if (config.mock) {
        console.error("[smoke] FEISHU_MOCK=1, 跳过 (本脚本只验证真飞书凭据)");
        process.exit(0);
    }
    console.error(`[smoke] app_id=${maskSecret(config.feishu.appId)} testing tenant_access_token...`);
    try {
        const t = await getToken();
        console.error(`[smoke] ✅ token OK ${maskSecret(t)}`);
        // 再调一次列 chats，进一步验证 im:chat:readonly 权限
        const { listSelfChats } = await import("../feishu.js");
        const chats = await listSelfChats();
        console.error(`[smoke] ✅ 列出 ${chats.length} 个 chat`);
        for (const c of chats) {
            console.error(`         - ${c.chat_mode}\t${c.name}\t${c.chat_id}`);
        }
        if (chats.length === 0) {
            console.error("[smoke] 提示：手机飞书加机器人发起单聊后，chats 数会 ≥1，那时再跑 get-chat-id");
        }
        process.exit(0);
    } catch (e) {
        console.error("[smoke] ❌ FAIL:", e);
        process.exit(1);
    }
}
main();
