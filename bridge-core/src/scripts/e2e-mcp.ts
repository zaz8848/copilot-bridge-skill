/**
 * MCP server 端到端自测：spawn 真 mcp-server，发 MCP JSON-RPC 请求，验证它转发到 bridge-core。
 * 必须先 build 两个包，且 bridge-core (mock 模式) 已在 3000 端口跑着。
 *
 * 用法 (在两个窗口里)：
 *   窗口 A: $env:FEISHU_MOCK="1"; node bridge-core/dist/index.js
 *   窗口 B: node bridge-core/dist/scripts/e2e-mcp.js
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_ENTRY = path.resolve(__dirname, "../../../mcp-server/dist/index.js");
const BRIDGE = "http://127.0.0.1:3000";

interface JsonRpcReq {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: unknown;
}

interface JsonRpcRes {
    jsonrpc: "2.0";
    id: number;
    result?: any;
    error?: { code: number; message: string };
}

function log(s: string) { console.log(`[e2e-mcp] ${s}`); }
function ok(s: string) { console.log(`[e2e-mcp] ✅ ${s}`); }
function fail(s: string): never { console.error(`[e2e-mcp] ❌ ${s}`); process.exit(1); }

async function main() {
    // 1) 先确认 bridge core 在
    try {
        const h = await fetch(`${BRIDGE}/health`).then((r) => r.json() as Promise<any>);
        if (!h.ok) throw new Error("not ok");
        ok(`bridge core alive version=${h.version}`);
    } catch {
        fail(`bridge core 没在 ${BRIDGE} 跑。先在另一个窗口起：$env:FEISHU_MOCK="1"; node bridge-core/dist/index.js`);
    }

    log(`spawning mcp-server: ${MCP_ENTRY}`);
    const proc = spawn(process.execPath, [MCP_ENTRY], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            BRIDGE_CORE_URL: BRIDGE,
            WORKSPACE_PATH: "d:/test/mcp-e2e-project",
        },
    });

    let stderr = "";
    proc.stderr.on("data", (b) => { stderr += b.toString(); });

    // MCP JSON-RPC 是按行划分的 JSON
    const pending = new Map<number, (msg: JsonRpcRes) => void>();
    let buf = "";
    proc.stdout.on("data", (b) => {
        buf += b.toString();
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
                const msg = JSON.parse(line) as JsonRpcRes;
                if (typeof msg.id === "number" && pending.has(msg.id)) {
                    pending.get(msg.id)!(msg);
                    pending.delete(msg.id);
                }
            } catch {
                // mcp 也可能发 notification，没 id；忽略
            }
        }
    });

    let nextId = 1;
    function rpc(method: string, params?: unknown, timeoutMs = 30000): Promise<JsonRpcRes> {
        const id = nextId++;
        const req: JsonRpcReq = { jsonrpc: "2.0", id, method, params };
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`rpc timeout: ${method}`));
            }, timeoutMs);
            pending.set(id, (msg) => { clearTimeout(t); resolve(msg); });
            proc.stdin.write(JSON.stringify(req) + "\n");
        });
    }

    // ---- 1) initialize ----
    log("RPC: initialize");
    const initRes = await rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e-mcp-test", version: "0.0.1" },
    });
    if (initRes.error) fail(`initialize failed: ${JSON.stringify(initRes.error)}`);
    ok(`initialize ok serverInfo=${JSON.stringify(initRes.result?.serverInfo)}`);

    // mcp 协议要求 client 发 initialized notification
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    // ---- 2) tools/list ----
    log("RPC: tools/list");
    const listRes = await rpc("tools/list");
    if (listRes.error) fail(`tools/list failed: ${JSON.stringify(listRes.error)}`);
    const tools = (listRes.result?.tools ?? []) as Array<{ name: string }>;
    const names = tools.map((t) => t.name).sort();
    const expected = [
        "feishu_health",
        "feishu_notify_and_wait",
        "feishu_resume",
        "feishu_wait_reply",
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
        fail(`tools 不对: 期望 ${expected.join(",")} 实际 ${names.join(",")}`);
    }
    ok(`tools/list 返回 ${expected.length} 个工具`);

    // ---- 3) tools/call feishu_notify ----
    log("RPC: tools/call feishu_notify");
    const callRes = await rpc("tools/call", {
        name: "feishu_notify",
        arguments: { message: "MCP e2e hello", level: "info" },
    });
    if (callRes.error) fail(`call failed: ${JSON.stringify(callRes.error)}`);
    const text1 = callRes.result?.content?.[0]?.text as string;
    if (!text1?.includes("已推送到飞书") || !text1.includes("task_id=")) {
        fail(`feishu_notify 返回不对: ${text1}`);
    }
    const m = text1.match(/task_id=(\w+)/);
    const taskId = m?.[1];
    if (!taskId) fail(`没解到 task_id`);
    ok(`feishu_notify ok task_id=${taskId}`);

    // ---- 4) tools/call feishu_wait_reply (短超时验 408 路径) ----
    log("RPC: tools/call feishu_wait_reply timeout=2");
    const waitRes = await rpc(
        "tools/call",
        { name: "feishu_wait_reply", arguments: { task_id: taskId, timeout_seconds: 2 } },
        10000
    );
    if (waitRes.error) fail(`wait_reply rpc failed: ${JSON.stringify(waitRes.error)}`);
    const text2 = waitRes.result?.content?.[0]?.text as string;
    const isErr = waitRes.result?.isError === true;
    if (!isErr || !text2?.includes("超时")) {
        fail(`feishu_wait_reply 应超时但: isError=${isErr} text=${text2}`);
    }
    ok(`feishu_wait_reply 正确返回超时错误`);

    // ---- 5) tools/call feishu_notify_and_wait + 模拟回复 ----
    log("RPC: tools/call feishu_notify_and_wait + 同时模拟用户回复");
    const naw = rpc(
        "tools/call",
        { name: "feishu_notify_and_wait", arguments: { message: "需要确认", timeout_seconds: 10 } },
        15000
    );
    // 等 mcp 把任务推过去（含真飞书 sendCard / 可能首次建群），然后我们假装用户回复
    await new Promise((r) => setTimeout(r, 3000));
    // 拿最新 pending task
    const tasks = await fetch(`${BRIDGE}/api/tasks`).then((r) => r.json() as Promise<any>);
    const latestPending = tasks.tasks?.find((t: any) => t.status === "pending" && t.message.includes("需要确认"));
    if (!latestPending) fail(`找不到刚推的 pending 任务`);
    // 通过 console /api/reply 模拟回复
    await fetch(`${BRIDGE}/api/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: latestPending.task_id, text: "好的，干吧" }),
    });

    const nawRes = await naw;
    if (nawRes.error) fail(`notify_and_wait failed: ${JSON.stringify(nawRes.error)}`);
    const text3 = nawRes.result?.content?.[0]?.text as string;
    if (!text3?.includes("好的，干吧")) {
        fail(`notify_and_wait 期望含 "好的，干吧" 实际: ${text3}`);
    }
    ok(`feishu_notify_and_wait 端到端通：MCP -> bridge -> reply -> MCP 拿到 "${text3.slice(0, 40)}..."`);

    proc.kill();
    console.log("\n[e2e-mcp] 🎉 全部通过：initialize / tools/list / 3 个工具 stdio 端到端");
    console.log("\n--- mcp-server stderr (最后 500 字符) ---");
    console.log(stderr.slice(-500));
    process.exit(0);
}

main().catch((e) => {
    console.error("[e2e-mcp] 异常:", e);
    process.exit(1);
});
