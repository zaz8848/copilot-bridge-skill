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

  app.get("/dashboard", (req: Request, res: Response) => {
    if (!ensureLocalOnly(req, res)) return;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(ATELIER_DASHBOARD_HTML);
  });

  console.error(`[dashboard] mounted at /dashboard (127.0.0.1 only)`);
}
