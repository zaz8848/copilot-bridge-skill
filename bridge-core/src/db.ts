import Database from "better-sqlite3";
import { config } from "./config.js";

export interface TaskRow {
    task_id: string;
    workspace_path: string;
    project_name: string;
    message: string;
    level: string;
    status: "pending" | "replied" | "expired" | "cancelled";
    feishu_message_id: string | null;
    chat_id: string | null;
    reply_text: string | null;
    reply_at: number | null;
    created_at: number;
    expired_at: number;
}

export interface ProjectChatRow {
    project_name: string;
    chat_id: string;
    created_at: number;
}

let db: Database.Database;

export function initDb() {
    db = new Database(config.paths.db);
    db.pragma("journal_mode = WAL");
    db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      workspace_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      message TEXT NOT NULL,
      level TEXT NOT NULL,
      status TEXT NOT NULL,
      feishu_message_id TEXT,
      chat_id TEXT,
      reply_text TEXT,
      reply_at INTEGER,
      created_at INTEGER NOT NULL,
      expired_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_chats (
      project_name TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      parent_task_id TEXT,
      text TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
  `);
    // 老库迁移：tasks 加 chat_id 列（必须在 CREATE INDEX 之前）
    try {
        const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
        if (!cols.some((c) => c.name === "chat_id")) {
            db.exec(`ALTER TABLE tasks ADD COLUMN chat_id TEXT`);
            console.error(`[db] migrated: tasks.chat_id added`);
        }
    } catch (e) {
        console.error(`[db] migration check err:`, e);
    }
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_feishu_msg ON tasks(feishu_message_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_chat ON tasks(chat_id);
    CREATE INDEX IF NOT EXISTS idx_pending_replies_project ON pending_replies(project_name, consumed_at);
  `);
    // 启动时把过期的 pending 标为 expired
    const now = Date.now();
    const r = db
        .prepare(`UPDATE tasks SET status='expired' WHERE status='pending' AND expired_at < ?`)
        .run(now);
    console.error(`[db] initialized at ${config.paths.db}, expired ${r.changes} stale tasks`);
}

export function insertTask(t: Omit<TaskRow, "feishu_message_id" | "reply_text" | "reply_at">) {
    console.error(`[db] insert task ${t.task_id} project=${t.project_name} chat=${t.chat_id ?? "-"}`);
    db.prepare(
        `INSERT INTO tasks (task_id, workspace_path, project_name, message, level, status, chat_id, created_at, expired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        t.task_id,
        t.workspace_path,
        t.project_name,
        t.message,
        t.level,
        t.status,
        t.chat_id ?? null,
        t.created_at,
        t.expired_at
    );
}

export function setTaskFeishuMessageId(taskId: string, feishuMessageId: string) {
    db.prepare(`UPDATE tasks SET feishu_message_id=? WHERE task_id=?`).run(feishuMessageId, taskId);
}

export function getTaskByFeishuMessageId(feishuMessageId: string): TaskRow | undefined {
    return db
        .prepare(`SELECT * FROM tasks WHERE feishu_message_id=?`)
        .get(feishuMessageId) as TaskRow | undefined;
}

export function getTaskByTaskId(taskId: string): TaskRow | undefined {
    return db.prepare(`SELECT * FROM tasks WHERE task_id=?`).get(taskId) as TaskRow | undefined;
}

export function getLatestPendingTask(): TaskRow | undefined {
    return db
        .prepare(`SELECT * FROM tasks WHERE status='pending' ORDER BY created_at DESC LIMIT 1`)
        .get() as TaskRow | undefined;
}

/** 按 chat_id 找最新 pending —— 多群路由用 */
export function getLatestPendingTaskByChat(chatId: string): TaskRow | undefined {
    return db
        .prepare(
            `SELECT * FROM tasks WHERE status='pending' AND chat_id=? ORDER BY created_at DESC LIMIT 1`
        )
        .get(chatId) as TaskRow | undefined;
}

export function getProjectChatId(projectName: string): string | undefined {
    const row = db
        .prepare(`SELECT chat_id FROM project_chats WHERE project_name=?`)
        .get(projectName) as { chat_id: string } | undefined;
    return row?.chat_id;
}

export function setProjectChatId(projectName: string, chatId: string) {
    console.error(`[db] map project "${projectName}" -> chat ${chatId}`);
    db.prepare(
        `INSERT OR REPLACE INTO project_chats (project_name, chat_id, created_at) VALUES (?, ?, ?)`
    ).run(projectName, chatId, Date.now());
}

export function listProjectChats(): ProjectChatRow[] {
    return db.prepare(`SELECT * FROM project_chats ORDER BY created_at`).all() as ProjectChatRow[];
}

export interface PendingReplyRow {
    id: number;
    chat_id: string;
    project_name: string;
    parent_task_id: string | null;
    text: string;
    received_at: number;
}

export function appendPendingReply(
    chatId: string,
    projectName: string,
    text: string,
    parentTaskId: string | null
): number {
    const r = db
        .prepare(
            `INSERT INTO pending_replies (chat_id, project_name, parent_task_id, text, received_at) VALUES (?, ?, ?, ?, ?)`
        )
        .run(chatId, projectName, parentTaskId, text, Date.now());
    console.error(
        `[db] pending_reply appended id=${r.lastInsertRowid} project=${projectName} parent=${parentTaskId ?? "-"}`
    );
    return Number(r.lastInsertRowid);
}

export function drainPendingReplies(projectName: string): PendingReplyRow[] {
    const rows = db
        .prepare(
            `SELECT id, chat_id, project_name, parent_task_id, text, received_at
             FROM pending_replies WHERE project_name=? AND consumed_at IS NULL ORDER BY received_at`
        )
        .all(projectName) as PendingReplyRow[];
    if (rows.length > 0) {
        const now = Date.now();
        const stmt = db.prepare(`UPDATE pending_replies SET consumed_at=? WHERE id=?`);
        const tx = db.transaction((items: PendingReplyRow[]) => {
            for (const r of items) stmt.run(now, r.id);
        });
        tx(rows);
    }
    return rows;
}

export function setTaskReplied(taskId: string, replyText: string) {
    console.error(`[db] task ${taskId} replied len=${replyText.length}`);
    db.prepare(
        `UPDATE tasks SET status='replied', reply_text=?, reply_at=? WHERE task_id=? AND status='pending'`
    ).run(replyText, Date.now(), taskId);
}

export function setTaskExpired(taskId: string) {
    db.prepare(`UPDATE tasks SET status='expired' WHERE task_id=? AND status='pending'`).run(taskId);
}

export function isEventProcessed(eventId: string): boolean {
    const row = db.prepare(`SELECT event_id FROM processed_events WHERE event_id=?`).get(eventId);
    return !!row;
}

export function markEventProcessed(eventId: string) {
    db.prepare(`INSERT OR IGNORE INTO processed_events (event_id, processed_at) VALUES (?, ?)`).run(
        eventId,
        Date.now()
    );
}

/** 后台扫除：超期 pending -> expired，并清理 7 天前的 processed_events */
export function sweepExpired(): { tasksExpired: number; eventsCleared: number } {
    const now = Date.now();
    const tr = db
        .prepare(`UPDATE tasks SET status='expired' WHERE status='pending' AND expired_at < ?`)
        .run(now);
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
    const er = db.prepare(`DELETE FROM processed_events WHERE processed_at < ?`).run(sevenDaysAgo);
    return { tasksExpired: tr.changes, eventsCleared: er.changes };
}

export function closeDb() {
    if (db) {
        db.close();
        console.error(`[db] closed`);
    }
}
