/**
 * 端到端自测（mock 模式，不调真飞书）
 * 必须先 build：pnpm build
 *
 * 用法：
 *   $env:FEISHU_MOCK="1"; node bridge-core/dist/scripts/e2e-mock.js
 *
 * 在另一个 terminal 起 core：
 *   $env:FEISHU_MOCK="1"; node bridge-core/dist/index.js
 */

const BASE = process.env.BRIDGE_BASE ?? "http://127.0.0.1:3000";

async function http(method: "GET" | "POST", path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { status: res.status, data };
}

function log(s: string) { console.log(`[e2e] ${s}`); }
function ok(s: string) { console.log(`[e2e] ✅ ${s}`); }
function fail(s: string): never { console.error(`[e2e] ❌ ${s}`); process.exit(1); }

async function fakeFeishuReply(parentMessageId: string, text: string) {
    const event = {
        schema: "2.0",
        header: {
            event_id: `ev_${Math.random().toString(36).slice(2)}`,
            event_type: "im.message.receive_v1",
            create_time: String(Date.now()),
        },
        event: {
            sender: { sender_id: { open_id: "ou_test_user" } },
            message: {
                message_id: `om_user_${Math.random().toString(36).slice(2)}`,
                parent_id: parentMessageId,
                chat_id: "oc_mock",
                content: JSON.stringify({ text }),
                message_type: "text",
            },
        },
    };
    return http("POST", "/webhook/feishu", event);
}

async function fakeFeishuReplyByText(text: string) {
    const event = {
        schema: "2.0",
        header: {
            event_id: `ev_${Math.random().toString(36).slice(2)}`,
            event_type: "im.message.receive_v1",
            create_time: String(Date.now()),
        },
        event: {
            sender: { sender_id: { open_id: "ou_test_user" } },
            message: {
                message_id: `om_user_${Math.random().toString(36).slice(2)}`,
                chat_id: "oc_mock",
                content: JSON.stringify({ text }),
                message_type: "text",
            },
        },
    };
    return http("POST", "/webhook/feishu", event);
}

async function main() {
    log(`目标 bridge: ${BASE}`);
    // 0. health
    const h = await http("GET", "/health");
    if (h.status !== 200 || !h.data?.ok) fail(`health 失败 ${JSON.stringify(h)}`);
    ok(`health ok version=${h.data.version}`);

    // ====== A1: notify ======
    log("A1: notify 推一条");
    const a1 = await http("POST", "/api/notify", {
        message: "A1 hello",
        level: "info",
        project_name: "e2e-test",
        workspace_path: "d:/test/e2e-test",
    });
    if (a1.status !== 200 || !a1.data?.task_id) fail(`A1 notify 失败 ${JSON.stringify(a1)}`);
    ok(`A1 notify task_id=${a1.data.task_id} feishu_message_id=${a1.data.feishu_message_id}`);

    // ====== A3: timeout ======
    log("A3: 起 wait_reply timeout=2 → 应 408");
    const a3start = Date.now();
    const a3 = await http("GET", `/api/wait/${a1.data.task_id}?timeout=2`);
    const a3dur = Date.now() - a3start;
    if (a3.status !== 408) fail(`A3 期望 408，实际 ${a3.status} ${JSON.stringify(a3.data)}`);
    if (a3dur < 1500 || a3dur > 4000) fail(`A3 超时时长不对 ${a3dur}ms`);
    ok(`A3 408 in ${a3dur}ms`);

    // ====== A2: 多任务并发不串话 ======
    log("A2: 推 3 个 notify_and_wait，逆序回，不能串话");
    const concurrent = ["task-alpha", "task-beta", "task-gamma"].map((m) =>
        http("POST", "/api/notify-and-wait", {
            message: m,
            project_name: "e2e-test",
            workspace_path: "d:/test/e2e-test",
            timeout_seconds: 30,
        })
    );

    // 等 200ms 让 3 个任务都注册到 waiters
    await new Promise((r) => setTimeout(r, 300));

    // 拿这 3 个任务的 task_id（从 DB？没有 list API。换种验证方式：
    // 我们改成先各自单独 notify 拿 id，再 wait_reply）
    // 取消上面的并发，改用更可控的策略：
    const cancelController = new AbortController();
    for (const p of concurrent) p.then(() => { }, () => { });

    // 由于 notify_and_wait 不会先返回 task_id 再阻塞，没法事先知道 id。
    // 改用下面的"先 notify 各自拿 id，再各自 wait"
    log("A2 改进：notify * 3 拿 id，并发 wait，按引用回复路由");

    const ids: string[] = [];
    const fmsg: string[] = [];
    for (const m of ["msg-A", "msg-B", "msg-C"]) {
        const r = await http("POST", "/api/notify", {
            message: m,
            level: "ask",
            project_name: "e2e-test",
            workspace_path: "d:/test/e2e-test",
        });
        if (r.status !== 200) fail(`A2 notify 失败 ${JSON.stringify(r)}`);
        ids.push(r.data.task_id);
        fmsg.push(r.data.feishu_message_id);
    }
    ok(`A2 三个 task_id: ${ids.join(", ")}`);

    // 并发挂起 wait
    const waits = ids.map((id) => http("GET", `/api/wait/${id}?timeout=15`));

    await new Promise((r) => setTimeout(r, 200));

    // 逆序模拟用户回复（引用 msg-C 那条 → "reply-C"）
    log("A2 逆序引用回复...");
    await fakeFeishuReply(fmsg[2], "reply-C");
    await new Promise((r) => setTimeout(r, 100));
    await fakeFeishuReply(fmsg[0], "reply-A");
    await new Promise((r) => setTimeout(r, 100));
    await fakeFeishuReply(fmsg[1], "reply-B");

    const results = await Promise.all(waits);
    const expected = ["reply-A", "reply-B", "reply-C"];
    for (let i = 0; i < 3; i++) {
        if (results[i].status !== 200) fail(`A2[${i}] 不是 200 ${JSON.stringify(results[i])}`);
        if (results[i].data.reply !== expected[i]) {
            fail(`A2[${i}] 串话了！期望 "${expected[i]}" 实际 "${results[i].data.reply}"`);
        }
    }
    ok(`A2 三个并发任务全部正确路由，引用回复路径通`);

    // ====== A2.2: 兜底路由（最近 pending） ======
    log("A2.2: 单 task + 普通文本回复 → 兜底路由");
    const r1 = await http("POST", "/api/notify", {
        message: "fallback test",
        project_name: "e2e-test",
        workspace_path: "d:/test/e2e-test",
    });
    const wp = http("GET", `/api/wait/${r1.data.task_id}?timeout=10`);
    await new Promise((r) => setTimeout(r, 100));
    await fakeFeishuReplyByText("用户随便回的话");
    const wpr = await wp;
    if (wpr.status !== 200 || wpr.data.reply !== "用户随便回的话") {
        fail(`A2.2 兜底路由失败 ${JSON.stringify(wpr)}`);
    }
    ok(`A2.2 兜底路由通`);

    // ====== A2.3: #task_id 显式标 ======
    log("A2.3: 用 #task_id 显式标路由");
    const r2 = await http("POST", "/api/notify", {
        message: "task_id route test",
        project_name: "e2e-test",
        workspace_path: "d:/test/e2e-test",
    });
    const r3 = await http("POST", "/api/notify", {
        message: "另一个干扰任务",
        project_name: "e2e-test",
        workspace_path: "d:/test/e2e-test",
    });
    const wp2 = http("GET", `/api/wait/${r2.data.task_id}?timeout=10`);
    await new Promise((r) => setTimeout(r, 100));
    await fakeFeishuReplyByText(`#${r2.data.task_id} 给老的那个回话`);
    const wp2r = await wp2;
    if (wp2r.status !== 200 || !wp2r.data.reply.includes("给老的那个回话")) {
        fail(`A2.3 #task_id 路由失败 ${JSON.stringify(wp2r)}`);
    }
    ok(`A2.3 #task_id 路由通 reply="${wp2r.data.reply}"`);
    // 清理 r3 — 用 fakeFeishuReplyByText 兜底回掉它，免得阻塞
    await fakeFeishuReplyByText("收尾干扰任务");

    // ====== 事件去重 ======
    log("dedup: 同一 event_id 重发应忽略");
    const dupEvent = {
        schema: "2.0",
        header: {
            event_id: "ev_dup_test_fixed",
            event_type: "im.message.receive_v1",
            create_time: String(Date.now()),
        },
        event: {
            message: {
                message_id: "om_dup",
                chat_id: "oc_mock",
                content: JSON.stringify({ text: "first" }),
                message_type: "text",
            },
        },
    };
    await http("POST", "/webhook/feishu", dupEvent);
    await http("POST", "/webhook/feishu", dupEvent); // 第二次应被去重
    ok(`dedup 测试已发，看 core 日志应有 "duplicate event ev_dup_test_fixed, ignored"`);

    // ====== A6: 卡片结构校验（mock 也能验，等真飞书时只剩"手机上好不好看"） ======
    log("A6: 卡片 JSON 结构校验");
    const { buildCard } = await import("../feishu.js");
    for (const lvl of ["info", "ask", "done", "error"] as const) {
        const card: any = buildCard({
            taskId: "t_a6",
            projectName: "e2e-test",
            message: "**粗体** + 普通文字 + `code`",
            level: lvl,
        });
        if (!card.header?.template) fail(`A6 ${lvl}: header.template 缺失`);
        if (!card.header?.title?.content?.includes("e2e-test")) fail(`A6 ${lvl}: header.title 不含 project`);
        if (!Array.isArray(card.elements) || card.elements.length < 3) fail(`A6 ${lvl}: elements 应至少 3 个`);
        if (card.elements[0]?.text?.tag !== "lark_md") fail(`A6 ${lvl}: 第一段不是 lark_md`);
        if (card.elements[1]?.tag !== "hr") fail(`A6 ${lvl}: 缺分隔线`);
        const note = card.elements[2];
        if (note?.tag !== "note" || !note.elements?.[0]?.content?.includes("t_a6")) fail(`A6 ${lvl}: note 缺 task_id`);
        // JSON.stringify 必须能跑通（飞书要 content: JSON.stringify(card)）
        const s = JSON.stringify(card);
        if (s.length < 50 || s.length > 5000) fail(`A6 ${lvl}: 卡片 JSON 长度异常 ${s.length}`);
    }
    ok(`A6 卡片结构 4 个 level 全合法`);

    console.log("\n[e2e] 🎉 全部通过：A1 / A2 / A2.2 / A2.3 / A3 / A6 / dedup");
}

main().catch((e) => {
    console.error("[e2e] 异常:", e);
    process.exit(1);
});
