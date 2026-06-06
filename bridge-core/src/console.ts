/**
 * 本地控制台 (兜底通信通道)
 * GET  /console        → 简单 HTML 页面，列出所有 task，可在网页上回复
 * GET  /api/tasks      → JSON 列表
 * POST /api/reply      → { task_id, text }，模拟用户回复（绕过飞书）
 *
 * 用途：
 *   1) 飞书没配好时先用本地控制台跑通 VS Code → bridge → "用户" 全链路
 *   2) 飞书 API 故障时兜底
 */
import type { Express, Request, Response } from "express";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { setTaskReplied, getTaskByTaskId } from "./db.js";
import { resolveWaiter } from "./waiters.js";

interface TaskRow {
    task_id: string;
    project_name: string;
    workspace_path: string;
    message: string;
    level: string;
    status: string;
    reply_text: string | null;
    reply_at: number | null;
    created_at: number;
    expired_at: number;
}

export function mountConsole(app: Express) {
    // 复用同一个 db 文件 (better-sqlite3 同进程多 connection ok)
    const db = new Database(config.paths.db);

    app.get("/api/tasks", (_req: Request, res: Response) => {
        const rows = db
            .prepare(
                `SELECT task_id, project_name, workspace_path, message, level, status, reply_text, reply_at, created_at, expired_at
         FROM tasks ORDER BY created_at DESC LIMIT 100`
            )
            .all() as TaskRow[];
        res.json({ tasks: rows });
    });

    app.post("/api/reply", (req: Request, res: Response) => {
        const taskId = String(req.body?.task_id ?? "").trim();
        const text = String(req.body?.text ?? "").trim();
        if (!taskId || !text) {
            res.status(400).json({ error: "task_id and text required" });
            return;
        }
        const task = getTaskByTaskId(taskId);
        if (!task) {
            res.status(404).json({ error: "task not found" });
            return;
        }
        if (task.status !== "pending") {
            res.status(410).json({ error: `task ${task.status}` });
            return;
        }
        setTaskReplied(taskId, text);
        resolveWaiter(taskId, text);
        console.error(`[console] manual reply -> task ${taskId} text="${text.slice(0, 40)}"`);
        res.json({ ok: true });
    });

    app.get("/console", (_req: Request, res: Response) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(CONSOLE_HTML);
    });
}

const CONSOLE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Copilot Bridge Console</title>
<style>
  body { font: 14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif; background:#0d1117; color:#e6edf3; padding:20px; max-width: 900px; margin:0 auto; }
  h1 { margin: 0 0 16px; font-size: 22px; }
  .sub { color:#7d8590; margin-bottom: 20px; }
  .task { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:14px; margin-bottom:12px; }
  .head { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
  .pill { font-size: 11px; padding: 2px 8px; border-radius: 12px; }
  .p-pending { background:#3a2a06; color:#f9c84a; }
  .p-replied { background:#0c2d1d; color:#3fb950; }
  .p-expired { background:#3a0a0e; color:#f85149; }
  .p-cancelled { background:#1f1f1f; color:#7d8590; }
  .l-info { background:#0d3666; color:#79c0ff; }
  .l-ask  { background:#5b3b00; color:#ffb454; }
  .l-done { background:#0c2d1d; color:#3fb950; }
  .l-error{ background:#3a0a0e; color:#f85149; }
  .proj { font-weight: 600; color:#e6edf3; }
  .tid  { color:#7d8590; font-family: monospace; }
  .msg  { white-space: pre-wrap; padding: 10px 0; border-top:1px solid #30363d; border-bottom:1px solid #30363d; margin: 8px 0; }
  .reply { background:#0d1117; padding: 8px; border-radius: 6px; color:#7ee787; white-space: pre-wrap; }
  textarea { width:100%; box-sizing: border-box; background:#0d1117; color:#e6edf3; border:1px solid #30363d; border-radius:6px; padding:8px; font: 13px monospace; min-height: 60px; }
  button { background:#238636; color:white; border:0; border-radius:6px; padding: 6px 14px; cursor:pointer; margin-top:6px; font-size: 13px; }
  button:hover { background:#2ea043; }
  button:disabled { background:#30363d; cursor:not-allowed; }
  .empty { color:#7d8590; text-align:center; padding: 40px; }
  .time { color:#7d8590; font-size: 11px; }
</style></head>
<body>
  <h1>🤖 Copilot Bridge Console</h1>
  <div class="sub">本地兜底通信通道。所有任务在这里都能直接回复，绕过飞书。每 2 秒自动刷新。</div>
  <div id="list"></div>

<script>
const LEVEL_ICON = { info:'ℹ️', ask:'❓', done:'✅', error:'❌' };
function fmt(t){ return new Date(t).toLocaleString('zh-CN', {hour12:false}); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function refresh(){
  const r = await fetch('/api/tasks').then(x=>x.json());
  const list = document.getElementById('list');
  if (!r.tasks || r.tasks.length === 0){
    list.innerHTML = '<div class="empty">还没有任何任务。让 Copilot 调一次 feishu_notify 就会出现在这里。</div>';
    return;
  }
  list.innerHTML = r.tasks.map(t => {
    const cleanMsg = t.message.replace(/\\n\\n_回复时引用本卡片.*?_$/, '');
    const replyForm = t.status === 'pending'
      ? '<textarea id="rt-'+t.task_id+'" placeholder="在这里输入回复..."></textarea>'
        +'<button onclick="reply(\\''+t.task_id+'\\')">回复</button>'
      : t.reply_text
        ? '<div class="reply">↳ '+esc(t.reply_text)+'</div><div class="time">回复于 '+fmt(t.reply_at)+'</div>'
        : '';
    return '<div class="task">'
      +'<div class="head">'
      +'<span class="proj">['+esc(t.project_name)+']</span>'
      +'<span class="pill l-'+t.level+'">'+LEVEL_ICON[t.level]+' '+t.level+'</span>'
      +'<span class="pill p-'+t.status+'">'+t.status+'</span>'
      +'<span class="tid">#'+t.task_id+'</span>'
      +'<span class="time" style="margin-left:auto">'+fmt(t.created_at)+'</span>'
      +'</div>'
      +'<div class="msg">'+esc(cleanMsg)+'</div>'
      +replyForm
      +'</div>';
  }).join('');
}

async function reply(taskId){
  const ta = document.getElementById('rt-'+taskId);
  const text = ta.value.trim();
  if (!text) return;
  const btn = ta.nextElementSibling;
  btn.disabled = true;
  const r = await fetch('/api/reply', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task_id: taskId, text }) }).then(x=>x.json());
  if (r.error) { alert(r.error); btn.disabled = false; }
  else { refresh(); }
}

refresh();
setInterval(refresh, 2000);
</script>
</body></html>`;
