import type { Express, Request, Response } from "express";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { resolveWaiter, listActiveWaiterTaskIds } from "./waiters.js";
import { appendPendingReply, setTaskReplied } from "./db.js";
import { ATELIER_DASHBOARD_HTML } from "./dashboard-html.js";

/**
 * Dashboard：本地运维看板。挂在 /dashboard 路径上。
 * - 只接受 127.0.0.1 来源（防 cloudflared 把它暴露到公网）
 * - 单页 HTML（在 dashboard-html.ts），Atelier-Ledger 美学
 * - 6 个 API：tasks / stats / agents / agent history / cancel / reply
 *
 * 美学纪律见 .github/skills/frontend-design/SKILL.md
 *
 * 安全：依赖 cloudflared ingress 路径白名单（不放 /dashboard 和 /api/dashboard 走公网）。
 * 见 PROJECT_BLUEPRINT §8.5。
 */

function ensureLocalOnly(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket.remoteAddress || "";
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocal) {
    console.error(`[dashboard] rejected non-local request from ${ip}`);
    res.status(403).json({ error: "dashboard 仅允许本机访问" });
    return false;
  }
  return true;
}

// 抽 card 文本第一行有意义的内容（用于 A1-lite digest）：
// - 去 markdown 头 `#` / quote `>` / list `-` `*`
// - 跳过空白和纯标点
// - 截到 80 字
function extractFirstLine(md: string | null): string {
  if (!md) return '';
  const lines = md.split(/\r?\n/);
  for (let raw of lines) {
    let l = raw.trim();
    if (!l) continue;
    // 去 markdown 前缀
    l = l.replace(/^#+\s*/, '').replace(/^[>*\-]+\s*/, '').replace(/^\d+\.\s*/, '');
    l = l.replace(/^\*\*(.+?)\*\*/, '$1');
    l = l.trim();
    if (!l) continue;
    if (l.length < 2) continue;
    return l.length > 80 ? l.slice(0, 80) + '…' : l;
  }
  return '';
}

interface TaskListRow {
  task_id: string;
  project_name: string;
  workspace_path: string;
  message: string;
  level: string;
  status: string;
  feishu_message_id: string | null;
  reply_text: string | null;
  reply_at: number | null;
  created_at: number;
  expired_at: number;
  has_waiter: boolean;
}

export function mountDashboard(app: Express) {
  const db = new Database(config.paths.db, { readonly: false });

  app.get("/api/dashboard/tasks", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const status = String(req.query.status || "").trim();
    const project = String(req.query.project || "").trim();

    const conditions: string[] = [];
    const params: any[] = [];
    if (status) { conditions.push("status = ?"); params.push(status); }
    if (project) { conditions.push("project_name = ?"); params.push(project); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db.prepare(`
            SELECT task_id, project_name, workspace_path, message, level, status,
                   feishu_message_id, reply_text, reply_at, created_at, expired_at
            FROM tasks ${where}
            ORDER BY created_at DESC
            LIMIT ?
        `).all(...params, limit) as any[];

    const activeSet = new Set(listActiveWaiterTaskIds());
    const enriched: TaskListRow[] = rows.map(r => ({
      ...r,
      has_waiter: activeSet.has(r.task_id),
    }));

    res.json({ count: enriched.length, tasks: enriched });
  });

  app.get("/api/dashboard/stats", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const now = Date.now();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    const byStatus = db.prepare(
      `SELECT status, COUNT(*) AS n FROM tasks GROUP BY status`
    ).all() as Array<{ status: string; n: number }>;

    const byProject = db.prepare(
      `SELECT project_name, COUNT(*) AS total,
                    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending
             FROM tasks GROUP BY project_name ORDER BY total DESC LIMIT 20`
    ).all() as Array<{ project_name: string; total: number; pending: number }>;

    const todayCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE created_at >= ?`
    ).get(todayStartMs) as { n: number }).n;

    const avgReplyMs = db.prepare(
      `SELECT AVG(reply_at - created_at) AS avg_ms FROM tasks
             WHERE status='replied' AND reply_at IS NOT NULL AND reply_at >= ?`
    ).get(todayStartMs) as { avg_ms: number | null };

    const activeWaiters = listActiveWaiterTaskIds();

    res.json({
      today_count: todayCount,
      today_avg_reply_seconds: avgReplyMs.avg_ms ? Math.round(avgReplyMs.avg_ms / 1000) : null,
      by_status: byStatus,
      by_project: byProject,
      active_waiters: activeWaiters,
      active_waiters_count: activeWaiters.length,
    });
  });

  app.post("/api/dashboard/cancel/:taskId", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const taskId = String(req.params.taskId);
    const row = db.prepare(`SELECT status FROM tasks WHERE task_id=?`).get(taskId) as { status: string } | undefined;
    if (!row) { res.status(404).json({ error: "task not found" }); return; }
    if (row.status !== "pending") { res.status(409).json({ error: `task already ${row.status}` }); return; }
    const r = db.prepare(`UPDATE tasks SET status='cancelled' WHERE task_id=? AND status='pending'`).run(taskId);
    const delivered = resolveWaiter(taskId, "[DASHBOARD_CANCELLED]");
    console.error(`[dashboard] cancelled task ${taskId} db_changes=${r.changes} waiter_delivered=${delivered}`);
    res.json({ ok: true, task_id: taskId, db_changes: r.changes, waiter_delivered: delivered });
  });

  app.post("/api/dashboard/reply/:taskId", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const taskId = String(req.params.taskId);
    const body = req.body as { text?: string };
    const text = (body.text || "").trim();
    if (!text) { res.status(400).json({ error: "text required" }); return; }
    const row = db.prepare(`SELECT status, project_name, chat_id FROM tasks WHERE task_id=?`)
      .get(taskId) as { status: string; project_name: string; chat_id: string | null } | undefined;
    if (!row) { res.status(404).json({ error: "task not found" }); return; }

    const finalText = `[人工/dashboard] ${text}`;
    if (row.status === "pending") setTaskReplied(taskId, finalText);
    const delivered = resolveWaiter(taskId, finalText);
    let mirrored = false;
    if (!delivered && row.chat_id) {
      appendPendingReply(row.chat_id, row.project_name, taskId, finalText);
      mirrored = true;
    }
    console.error(`[dashboard] manual reply task=${taskId} delivered=${delivered} mirrored=${mirrored}`);
    res.json({ ok: true, task_id: taskId, delivered, mirrored });
  });

  // --- API: 按 agent (project) 列摘要 ---
  app.get("/api/dashboard/agents", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const rows = db.prepare(`
            SELECT
                project_name,
                COUNT(*)                                  AS total,
                SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status='replied'  THEN 1 ELSE 0 END) AS replied,
                SUM(CASE WHEN status='expired'  THEN 1 ELSE 0 END) AS expired,
                SUM(CASE WHEN status='cancelled'THEN 1 ELSE 0 END) AS cancelled,
                MIN(created_at)                           AS first_seen,
                MAX(created_at)                           AS last_seen,
                MAX(reply_at)                             AS last_reply,
                AVG(CASE WHEN status='replied' AND reply_at IS NOT NULL THEN (reply_at - created_at) END) AS avg_ms
            FROM tasks
            GROUP BY project_name
            ORDER BY MAX(created_at) DESC
        `).all() as any[];
    const activeSet = new Set(listActiveWaiterTaskIds());
    const pendingTasks = db.prepare(
      `SELECT task_id, project_name FROM tasks WHERE status='pending'`
    ).all() as Array<{ task_id: string; project_name: string }>;
    const projWithLiveWaiter = new Set<string>();
    const orphanPerProj = new Map<string, number>();
    for (const t of pendingTasks) {
      if (activeSet.has(t.task_id)) {
        projWithLiveWaiter.add(t.project_name);
      } else {
        orphanPerProj.set(t.project_name, (orphanPerProj.get(t.project_name) || 0) + 1);
      }
    }
    // 未消费的离线消息（pending_replies 队列）按 project 聚合
    const unreadRows = db.prepare(
      `SELECT project_name, COUNT(*) AS n FROM pending_replies WHERE consumed_at IS NULL GROUP BY project_name`
    ).all() as Array<{ project_name: string; n: number }>;
    const unreadPerProj = new Map<string, number>();
    for (const u of unreadRows) unreadPerProj.set(u.project_name, u.n);

    const enriched = rows.map(r => ({
      ...r,
      avg_reply_seconds: r.avg_ms ? Math.round(r.avg_ms / 1000) : null,
      has_live_waiter: projWithLiveWaiter.has(r.project_name),
      orphan_pending: orphanPerProj.get(r.project_name) || 0,
      unread_replies: unreadPerProj.get(r.project_name) || 0,
    }));
    res.json({ count: enriched.length, agents: enriched });
  });

  // --- API: 单个 agent 未消费的离线消息（pending_replies 队列） ---
  app.get("/api/dashboard/agent/:project/inbox", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const project = String(req.params.project);
    const rows = db.prepare(`
      SELECT id, parent_task_id, text, received_at
      FROM pending_replies
      WHERE project_name=? AND consumed_at IS NULL
      ORDER BY received_at DESC
      LIMIT 100
    `).all(project) as any[];
    res.json({ project_name: project, count: rows.length, replies: rows });
  });

  // --- API: 清空某 agent 的未读离线消息（把 pending_replies 标 consumed） ---
  app.post("/api/dashboard/agent/:project/clear-unread", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const project = String(req.params.project);
    const now = Date.now();
    const r = db.prepare(
      `UPDATE pending_replies SET consumed_at=? WHERE project_name=? AND consumed_at IS NULL`
    ).run(now, project);
    console.error(`[dashboard] cleared ${r.changes} unread replies for project=${project}`);
    res.json({ ok: true, project_name: project, cleared: r.changes });
  });
  // --- API: 彻底删除某 agent（所有 task + 未读 + 飞书群关系；不可逆） ---
  app.delete("/api/dashboard/agent/:project", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const project = String(req.params.project);
    // 先取消所有 pending task 的 live waiter（让 PS 进程退出 task_cancelled）
    const pendingRows = db.prepare(
      `SELECT task_id FROM tasks WHERE project_name=? AND status='pending'`
    ).all(project) as Array<{ task_id: string }>;
    for (const r of pendingRows) {
      resolveWaiter(r.task_id, "[DASHBOARD_DELETED]");
    }
    const tx = db.transaction((proj: string) => {
      const t = db.prepare(`DELETE FROM tasks WHERE project_name=?`).run(proj);
      const p = db.prepare(`DELETE FROM pending_replies WHERE project_name=?`).run(proj);
      // chats 表存项目↔chat_id 映射，删掉后下次该项目重新发卡会自动新建群
      let c = { changes: 0 } as { changes: number };
      try {
        c = db.prepare(`DELETE FROM chats WHERE project_name=?`).run(proj);
      } catch (e) {
        console.error(`[dashboard] chats table delete skipped:`, e);
      }
      return { tasks: t.changes, replies: p.changes, chats: c.changes };
    });
    const r = tx(project);
    console.error(`[dashboard] DELETED agent project=${project} tasks=${r.tasks} replies=${r.replies} chats=${r.chats}`);
    res.json({ ok: true, project_name: project, deleted: r });
  });
  // --- API: 单个 agent 的完整对话历史 ---
  app.get("/api/dashboard/agent/:project/history", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const project = String(req.params.project);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = db.prepare(`
            SELECT task_id, message, level, status, reply_text, reply_at, created_at, expired_at
            FROM tasks
            WHERE project_name = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(project, limit) as any[];
    const activeSet = new Set(listActiveWaiterTaskIds());
    const enriched = rows.map(r => ({ ...r, has_waiter: activeSet.has(r.task_id) }));
    res.json({ project_name: project, count: enriched.length, tasks: enriched });
  });

  // --- API: 图表聚合（24h 小时桶 / 14 天日桶 / 状态分布 / 7×24 热力图 / 今日摘要 / 词云） ---
  app.get("/api/dashboard/charts", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const now = Date.now();
    const day24Ms = 24 * 3600 * 1000;
    const day14Ms = 14 * 86400 * 1000;
    const day30Ms = 30 * 86400 * 1000;
    const since24 = now - day24Ms;
    const since14 = now - day14Ms;
    const since30 = now - day30Ms;

    // #1 过去 24h 按小时分桶
    const tasks24 = db.prepare(
      `SELECT created_at, reply_at FROM tasks WHERE created_at >= ?`
    ).all(since24) as Array<{ created_at: number; reply_at: number | null }>;
    const hourBuckets: Array<{ ts: number; created: number; replied: number }> = [];
    const hour = 3600 * 1000;
    const startHour = Math.floor(since24 / hour) * hour;
    for (let i = 0; i < 24; i++) hourBuckets.push({ ts: startHour + i * hour, created: 0, replied: 0 });
    for (const t of tasks24) {
      const cBucket = Math.floor((t.created_at - startHour) / hour);
      if (cBucket >= 0 && cBucket < 24) hourBuckets[cBucket].created++;
      if (t.reply_at && t.reply_at >= since24) {
        const rBucket = Math.floor((t.reply_at - startHour) / hour);
        if (rBucket >= 0 && rBucket < 24) hourBuckets[rBucket].replied++;
      }
    }

    // #2 过去 14 天按日分桶（用本地 00:00 切分）
    const dayMs = 86400 * 1000;
    const tasks14 = db.prepare(
      `SELECT created_at, reply_at, status FROM tasks WHERE created_at >= ?`
    ).all(since14) as Array<{ created_at: number; reply_at: number | null; status: string }>;
    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0);
    const dayBuckets: Array<{ ts: number; created: number; replied: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(todayLocal);
      d.setDate(d.getDate() - i);
      dayBuckets.push({ ts: d.getTime(), created: 0, replied: 0 });
    }
    function localDayKey(ms: number) {
      const d = new Date(ms);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    const dayIdx = new Map<number, number>();
    dayBuckets.forEach((b, i) => dayIdx.set(b.ts, i));
    for (const t of tasks14) {
      const ci = dayIdx.get(localDayKey(t.created_at));
      if (ci !== undefined) dayBuckets[ci].created++;
      if (t.reply_at) {
        const ri = dayIdx.get(localDayKey(t.reply_at));
        if (ri !== undefined) dayBuckets[ri].replied++;
      }
    }

    // #5 全局状态分布
    const statusRows = db.prepare(
      `SELECT status, COUNT(*) AS n FROM tasks GROUP BY status`
    ).all() as Array<{ status: string; n: number }>;

    // #A7 过去 30 天 7(weekday)×24(hour) 中位回复延迟（毫秒），分桶
    // 用 reply_at 落 weekday/hour，因为 reply 那一刻才是"我回应的时段"
    const replied30 = db.prepare(
      `SELECT created_at, reply_at FROM tasks
       WHERE status='replied' AND reply_at IS NOT NULL AND reply_at >= ?`
    ).all(since30) as Array<{ created_at: number; reply_at: number }>;
    // heatmap[dayOfWeek 0=Sun][hour 0-23] = { median, n }
    const buckets: Array<Array<number[]>> = [];
    for (let d = 0; d < 7; d++) {
      buckets.push([]);
      for (let h = 0; h < 24; h++) buckets[d].push([]);
    }
    for (const r of replied30) {
      const dt = new Date(r.reply_at);
      const lag = r.reply_at - r.created_at;
      if (lag > 0 && lag < 7 * 86400 * 1000) {
        buckets[dt.getDay()][dt.getHours()].push(lag);
      }
    }
    const heatmap: Array<{ d: number; h: number; median_ms: number; n: number }> = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const arr = buckets[d][h];
        if (arr.length) {
          arr.sort((a, b) => a - b);
          const mid = arr[Math.floor(arr.length / 2)];
          heatmap.push({ d, h, median_ms: mid, n: arr.length });
        }
      }
    }

    // #A1-lite 今日摘要：按 project 聚合，每条取最多 3 张卡的"标题/首句"
    const todayMs = todayLocal.getTime();
    const todayCards = db.prepare(
      `SELECT project_name, message, status, created_at
       FROM tasks WHERE created_at >= ? ORDER BY created_at ASC`
    ).all(todayMs) as Array<{ project_name: string; message: string; status: string; created_at: number }>;
    const digestMap = new Map<string, { project_name: string; lines: string[]; count: number; first_seen: number; last_seen: number; pending: number; replied: number }>();
    for (const c of todayCards) {
      const cur = digestMap.get(c.project_name) || { project_name: c.project_name, lines: [], count: 0, first_seen: c.created_at, last_seen: c.created_at, pending: 0, replied: 0 };
      cur.count++;
      cur.last_seen = c.created_at;
      if (c.status === 'pending') cur.pending++;
      if (c.status === 'replied') cur.replied++;
      if (cur.lines.length < 3) {
        const firstLine = extractFirstLine(c.message);
        if (firstLine) cur.lines.push(firstLine);
      }
      digestMap.set(c.project_name, cur);
    }
    const digest = Array.from(digestMap.values()).sort((a, b) => b.count - a.count);

    // #A8 词云：本周所有 cards 文本提取高频 3+ 字母英文词（粗暴版，0 依赖）
    const week7Ms = 7 * 86400 * 1000;
    const weekCards = db.prepare(
      `SELECT message FROM tasks WHERE created_at >= ?`
    ).all(now - week7Ms) as Array<{ message: string }>;
    const wordFreq = new Map<string, number>();
    const stopWords = new Set([
      'the', 'and', 'for', 'you', 'are', 'this', 'that', 'with', 'from', 'have', 'has', 'was', 'will', 'not', 'but', 'all', 'can', 'use', 'one', 'now', 'get', 'set', 'see', 'how', 'why', 'who', 'what', 'when', 'where', 'which', 'into', 'out', 'about', 'over', 'under', 'just', 'like', 'also', 'more', 'most', 'some', 'any', 'than', 'then', 'them', 'they', 'their', 'there', 'been', 'being', 'does', 'did', 'do', 'so', 'too', 'very', 'much', 'many', 'should', 'could', 'would', 'may', 'might', 'must', 'shall', 'going', 'gonna', 'wanna',
      // markdown / code noise
      'div', 'span', 'function', 'const', 'let', 'var', 'true', 'false', 'null', 'undefined',
      // chinese-like noise (single chars filtered by length)
    ]);
    for (const c of weekCards) {
      const text = (c.message || '').toLowerCase();
      // 抽英文词
      const en = text.match(/[a-z][a-z0-9_\-]{2,}/g) || [];
      for (const w of en) {
        if (stopWords.has(w)) continue;
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
      }
      // 抽中文 2-4 字短语（粗暴：连续中文取 2-4 字滑窗）
      const zhMatches = text.match(/[\u4e00-\u9fa5]+/g) || [];
      for (const seg of zhMatches) {
        if (seg.length < 2) continue;
        // 取 2-3 字组合，避免噪音用 length>=4 的整段
        for (let i = 0; i + 2 <= seg.length && i < seg.length - 1; i++) {
          const phrase = seg.slice(i, i + 2);
          wordFreq.set(phrase, (wordFreq.get(phrase) || 0) + 1);
        }
      }
    }
    const wordcloud = Array.from(wordFreq.entries())
      .filter(([w, n]) => n >= 3 && w.length >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([word, count]) => ({ word, count }));

    res.json({
      generated_at: now,
      hourly_24h: hourBuckets,
      daily_14d: dayBuckets,
      status_distribution: statusRows,
      heatmap_30d: heatmap,
      digest_today: digest,
      wordcloud_7d: wordcloud,
    });
  });

  // --- API: 单 agent 人物画像 ---
  app.get("/api/dashboard/agent/:project/personality", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const project = String(req.params.project);
    const all = db.prepare(
      `SELECT created_at, reply_at, level, status FROM tasks WHERE project_name=?`
    ).all(project) as Array<{ created_at: number; reply_at: number | null; level: string; status: string }>;
    if (!all.length) { res.json({ project_name: project, empty: true }); return; }

    const total = all.length;
    const replied = all.filter(t => t.status === 'replied' && t.reply_at);
    const cancelled = all.filter(t => t.status === 'cancelled').length;
    // 中位回复延迟（仅 replied）
    const lags = replied.map(t => (t.reply_at as number) - t.created_at).sort((a, b) => a - b);
    const medianLagMs = lags.length ? lags[Math.floor(lags.length / 2)] : null;
    // 每天卡数（按 created_at 的天数跨度）
    const minCreated = Math.min(...all.map(t => t.created_at));
    const dayCount = Math.max(1, Math.ceil((Date.now() - minCreated) / 86400000));
    const perDay = total / dayCount;
    // level 分布
    const byLevel = new Map<string, number>();
    for (const t of all) byLevel.set(t.level, (byLevel.get(t.level) || 0) + 1);
    let topLevel = 'ask';
    let topLevelN = 0;
    byLevel.forEach((n, k) => { if (n > topLevelN) { topLevel = k; topLevelN = n; } });
    // 最爱小时（created_at 最频繁的小时）
    const hourCount = new Array(24).fill(0);
    for (const t of all) hourCount[new Date(t.created_at).getHours()]++;
    const peakHour = hourCount.indexOf(Math.max(...hourCount));
    // 最快回复
    const fastestMs = lags[0] || null;

    res.json({
      project_name: project,
      total_turns: total,
      cancelled,
      replied_count: replied.length,
      day_count: dayCount,
      avg_per_day: Number(perDay.toFixed(1)),
      median_reply_ms: medianLagMs,
      fastest_reply_ms: fastestMs,
      top_level: topLevel,
      top_level_pct: Math.round((topLevelN / total) * 100),
      peak_hour: peakHour,
      first_seen: minCreated,
      last_seen: Math.max(...all.map(t => t.created_at)),
    });
  });

  // --- API: Wrapped (周/月/年) 海报数据 ---
  app.get("/api/dashboard/wrapped", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    const range = String(req.query.range || 'week');
    let sinceMs = 0;
    let label = '';
    const now = Date.now();
    if (range === 'week') { sinceMs = now - 7 * 86400000; label = 'This Week'; }
    else if (range === 'month') { sinceMs = now - 30 * 86400000; label = 'This Month'; }
    else if (range === 'year') { sinceMs = now - 365 * 86400000; label = 'This Year'; }
    else { sinceMs = now - 7 * 86400000; label = 'This Week'; }

    const all = db.prepare(
      `SELECT project_name, created_at, reply_at, level, status FROM tasks WHERE created_at >= ?`
    ).all(sinceMs) as Array<{ project_name: string; created_at: number; reply_at: number | null; level: string; status: string }>;

    if (!all.length) { res.json({ label, range, since: sinceMs, empty: true }); return; }

    const total = all.length;
    const replied = all.filter(t => t.status === 'replied' && t.reply_at);
    // top 3 项目
    const byProj = new Map<string, number>();
    for (const t of all) byProj.set(t.project_name, (byProj.get(t.project_name) || 0) + 1);
    const topProjects = Array.from(byProj.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, count: n }));
    // peak hour
    const hourCount = new Array(24).fill(0);
    for (const t of all) hourCount[new Date(t.created_at).getHours()]++;
    const peakHour = hourCount.indexOf(Math.max(...hourCount));
    // peak day of week
    const dowCount = new Array(7).fill(0);
    for (const t of all) dowCount[new Date(t.created_at).getDay()]++;
    const peakDow = dowCount.indexOf(Math.max(...dowCount));
    // 回复延迟
    const lags = replied.map(t => (t.reply_at as number) - t.created_at).sort((a, b) => a - b);
    const medianLagMs = lags.length ? lags[Math.floor(lags.length / 2)] : null;
    const fastestMs = lags.length ? lags[0] : null;
    // level 分布
    const byLevel = new Map<string, number>();
    for (const t of all) byLevel.set(t.level, (byLevel.get(t.level) || 0) + 1);
    const levelMix = Array.from(byLevel.entries()).map(([level, n]) => ({ level, count: n, pct: Math.round((n / total) * 100) }));
    // 连击：找最长连续无超过 5 min 间隔的 created_at 串
    const sortedTs = all.map(t => t.created_at).sort((a, b) => a - b);
    let bestStreak = 1, curStreak = 1;
    for (let i = 1; i < sortedTs.length; i++) {
      if (sortedTs[i] - sortedTs[i - 1] <= 5 * 60 * 1000) {
        curStreak++;
        if (curStreak > bestStreak) bestStreak = curStreak;
      } else {
        curStreak = 1;
      }
    }
    const replyRate = Math.round((replied.length / total) * 100);

    res.json({
      label, range, since: sinceMs, generated_at: now,
      total_cards: total,
      replied_count: replied.length,
      reply_rate_pct: replyRate,
      top_projects: topProjects,
      project_count: byProj.size,
      peak_hour: peakHour,
      peak_dow: peakDow,
      median_reply_ms: medianLagMs,
      fastest_reply_ms: fastestMs,
      level_mix: levelMix,
      longest_streak: bestStreak,
    });
  });

  app.get("/dashboard", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(ATELIER_DASHBOARD_HTML);
  });

  console.error(`[dashboard] mounted at /dashboard (127.0.0.1 only)`);
}
