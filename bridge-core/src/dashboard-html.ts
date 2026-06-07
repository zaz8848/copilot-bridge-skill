// Companions 风格 dashboard
// 设计纪律：.github/skills/frontend-design/SKILL.md
// 方向：把每个 project 当成一只"AI 同伴/机器人"，不是 CRM 表格
//   - 每只 agent 有程序生成的几何头像（颜色和形状由 project_name hash 决定）
//   - 顶部水平 dock 摆放所有同伴（带头像 + 状态点 + 在线呼吸光）
//   - 中部精选"需要关注"的几只大卡（带头像 + pending 数量 + 最近一句话预览）
//   - 底部"全部住户"完整网格
//   - 点击 → drawer 聊天对话回放（保留 v0.0.28 的 atelier drawer，气泡式）

export const ATELIER_DASHBOARD_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Companions — Copilot Bridge</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    /* Neutrals — 暖象牙，不黑不白 */
    --ivory:        #f0e9d8;
    --ivory-light:  #f8f3e6;
    --ivory-deeper: #e6dcc4;
    --paper:        #fbf8f1;
    --rule:         #d6cdb5;
    --rule-deep:    #b9ad8d;
    --ink:          #1f1a14;
    --ink-soft:     #4a4133;
    --ink-mute:     #7a6f5d;
    --ink-faint:    #a89a82;

    /* Accent */
    --terra:        #c44536;
    --terra-deep:   #983327;
    --terra-soft:   rgba(196, 69, 54, 0.10);

    /* Companion palette — 每只 agent 从中按 hash 取一个 */
    --c1: #d0644b;  /* coral */
    --c2: #d99e3e;  /* amber */
    --c3: #b8a52a;  /* mustard */
    --c4: #82a05e;  /* moss */
    --c5: #5b9e8a;  /* spruce */
    --c6: #4b8aa7;  /* ocean */
    --c7: #6f6dc4;  /* iris */
    --c8: #a564a9;  /* mauve */
    --c9: #c75b8d;  /* rose */
    --c10:#a0866b;  /* clay */
    --c11:#7c8a7d;  /* sage */
    --c12:#cc8c46;  /* ochre */

    --serif: 'Fraunces', 'Garamond', 'Georgia', serif;
    --mono:  'Geist Mono', 'JetBrains Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--ivory); color: var(--ink); font-family: var(--serif); font-size: 15px; line-height: 1.55; min-height: 100vh; }
  body {
    background-image:
      radial-gradient(at 100% 0%, rgba(217, 158, 62, 0.10), transparent 50%),
      radial-gradient(at 0% 100%, rgba(91, 158, 138, 0.08), transparent 55%),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><circle cx='1' cy='1' r='0.4' fill='%23b9ad8d' opacity='0.30'/></svg>");
    background-attachment: fixed;
  }
  .shell { max-width: 1380px; margin: 0 auto; padding: 32px 36px 80px; }

  /* ─── Hero ─── */
  .hero {
    display: flex; justify-content: space-between; align-items: flex-end;
    padding-bottom: 24px; margin-bottom: 28px; border-bottom: 1px solid var(--rule);
    animation: rise 0.55s ease-out both;
  }
  .hero .greeting {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--ink-mute); margin-bottom: 12px;
  }
  .hero h1 {
    font-family: var(--serif); font-weight: 400; font-size: 60px; line-height: 1;
    letter-spacing: -0.04em;
  }
  .hero h1 em { font-style: italic; font-weight: 300; color: var(--terra); }
  .hero .signal {
    text-align: right; font-family: var(--mono); font-size: 10px;
    color: var(--ink-mute); letter-spacing: 0.18em; text-transform: uppercase;
  }
  .hero .signal .pulse {
    display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    background: #5b9e8a; margin-right: 6px; vertical-align: middle;
    box-shadow: 0 0 8px #5b9e8a;
    animation: pulse-soft 2.4s ease-in-out infinite;
  }
  .hero .signal time { display: block; margin-top: 6px; color: var(--ink-faint); font-size: 9.5px; }

  /* ─── Section title ─── */
  .section-title {
    display: flex; align-items: baseline; gap: 18px;
    margin: 36px 0 18px; padding-bottom: 8px; border-bottom: 1px dashed var(--rule);
  }
  .section-title h2 {
    font-family: var(--serif); font-weight: 400; font-size: 22px; letter-spacing: -0.01em;
  }
  .section-title h2 em { font-style: italic; color: var(--terra); font-weight: 300; }
  .section-title .count {
    font-family: var(--mono); font-size: 10px; color: var(--ink-mute);
    text-transform: uppercase; letter-spacing: 0.2em;
  }
  .section-title .right { margin-left: auto; display: flex; gap: 12px; align-items: center; }
  .section-title input[type=text] {
    background: var(--paper); border: 1px solid var(--rule);
    padding: 6px 12px; font-family: var(--mono); font-size: 11px; color: var(--ink);
    outline: none; min-width: 200px; transition: border-color 0.18s;
  }
  .section-title input[type=text]:focus { border-color: var(--terra); }
  .section-title .sort-select {
    background: var(--paper); border: 1px solid var(--rule);
    padding: 6px 28px 6px 12px; font-family: var(--mono); font-size: 10.5px; color: var(--ink);
    outline: none; cursor: pointer;
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23807a6b' stroke-width='1.4' fill='none'/></svg>");
    background-repeat: no-repeat; background-position: right 10px center;
    transition: border-color 0.18s;
  }
  .section-title .sort-select:focus,
  .section-title .sort-select:hover { border-color: var(--ink); }
  .section-title .toggle {
    display: inline-flex; align-items: center; gap: 7px; cursor: pointer; user-select: none;
    font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.18em;
    color: var(--ink-mute);
  }
  .section-title .toggle input { accent-color: var(--terra); cursor: pointer; }

  /* ─── Dock (顶部水平同伴条) ─── */
  .dock {
    display: flex; gap: 14px; overflow-x: auto; overflow-y: visible;
    padding: 4px 2px 12px; margin: 8px 0 4px;
    scrollbar-width: thin; scrollbar-color: var(--rule-deep) transparent;
  }
  .dock::-webkit-scrollbar { height: 6px; }
  .dock::-webkit-scrollbar-thumb { background: var(--rule-deep); border-radius: 4px; }

  .companion-mini {
    flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    cursor: pointer; min-width: 72px;
    animation: rise-fast 0.45s ease-out both;
  }
  .companion-mini .avatar {
    width: 54px; height: 54px; position: relative;
    transition: transform 0.2s ease-out;
  }
  .companion-mini:hover .avatar { transform: scale(1.08); }
  .companion-mini .label {
    font-family: var(--mono); font-size: 9.5px; color: var(--ink-soft);
    max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    text-align: center; letter-spacing: 0.04em;
  }
  .companion-mini .badge {
    position: absolute; top: -3px; right: -3px;
    min-width: 18px; height: 18px; padding: 0 5px;
    background: var(--ink); color: var(--paper);
    border-radius: 9px;
    font-family: var(--mono); font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--ivory);
    line-height: 1;
  }
  .companion-mini .heartbeat {
    position: absolute; left: -2px; top: -2px; right: -2px; bottom: -2px;
    border-radius: 50%; pointer-events: none;
  }
  .companion-mini.live .heartbeat {
    animation: heartbeat 1.4s ease-in-out infinite;
    box-shadow: 0 0 0 0 var(--terra-soft);
  }
  .companion-mini.sleeping .avatar { filter: grayscale(0.35) opacity(0.55); }

  /* ─── Companion cards (clawd-pet 驱动 · v3 极简) ─── */
  /* v3 改动：卡再缩 1/3；状态徽章统一到右上 corner；左上扫把右上叉，hover 出现；LIVE 禁删 */
  .featured-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px;
    animation: fade 0.6s ease-out 0.2s both;
  }
  .featured {
    position: relative; cursor: pointer;
    background: var(--paper);
    border: 1px solid var(--rule);
    padding: 10px 10px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
  }
  .featured:hover {
    transform: translateY(-2px);
    border-color: var(--ink);
    box-shadow: 0 10px 22px -14px rgba(31,26,20,0.3);
  }
  .featured:hover .corner-act { opacity: 1; }
  .featured.live   { border-color: var(--terra); }
  .featured.live::before {
    content:''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--terra);
  }
  .featured.unread { border-color: #d99e3e; background: linear-gradient(180deg, var(--paper) 0%, #fef5e3 100%); }
  .featured.unread::before {
    content:''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #d99e3e;
  }

  /* 左上角 🧹 扫把（hover 显示，点了清空未读） */
  .featured .broom {
    position: absolute; top: 4px; left: 4px;
    width: 20px; height: 20px; line-height: 18px; text-align: center;
    background: var(--paper); border: 1px solid var(--rule-deep);
    font-size: 11px; cursor: pointer;
    color: var(--ink-mute);
    border-radius: 50%;
    opacity: 0; transition: opacity 0.15s, color 0.15s, border-color 0.15s;
    z-index: 6;
  }
  .featured .broom:hover { color: #b8860b; border-color: #d99e3e; background: #fef5e3; }
  /* 右上角 × 删除（hover 显示；LIVE 时禁用） */
  .featured .corner-act {
    position: absolute; top: 4px; right: 4px;
    width: 20px; height: 20px; line-height: 18px; text-align: center;
    background: var(--paper); border: 1px solid var(--rule-deep);
    font-family: var(--mono); font-size: 13px; font-weight: 600;
    color: var(--ink-mute); cursor: pointer;
    border-radius: 50%;
    opacity: 0; transition: opacity 0.15s, color 0.15s, border-color 0.15s, background 0.15s;
    z-index: 6;
  }
  .featured .corner-act:hover { color: var(--terra); border-color: var(--terra); background: #fdf6f0; }
  .featured .corner-act.disabled { cursor: not-allowed; opacity: 0.35; }
  .featured .corner-act.disabled:hover { color: var(--ink-mute); border-color: var(--rule-deep); background: var(--paper); }

  /* pet stage 紧凑（上半部分缩 1/3：96→64） */
  .featured .pet-stage {
    width: 64px; height: 64px;
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .featured .pet-stage img {
    width: 100%; height: 100%; display: block;
    image-rendering: pixelated;
    pointer-events: none;
  }
  .featured.live .pet-stage img { animation: pet-bounce 1.6s ease-in-out infinite; }

  /* 状态徽章（statepill）— 右上 corner（在 × 删除下方，不冲突；× 是 hover 才出） */
  .featured .statepill {
    position: absolute; top: 6px; right: 28px;
    display: flex; align-items: center; gap: 4px;
    padding: 2px 7px;
    background: var(--ink); color: var(--paper);
    font-family: var(--mono); font-size: 10px; font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 9px;
    z-index: 5;
    animation: badge-pop 0.4s cubic-bezier(0.18, 0.95, 0.32, 1.15) both;
  }
  .featured.live .statepill   { background: var(--terra); color: var(--paper); }
  .featured.unread .statepill { background: #d99e3e; color: var(--ink); }
  .featured .statepill .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
  }
  .featured.live .statepill .dot {
    background: #fbf8f1;
    animation: pulse-soft 1s ease-in-out infinite;
  }

  /* 名牌（紧凑） */
  .featured .plate {
    width: 100%; padding-top: 3px;
    border-top: 1px dashed var(--rule);
    text-align: center;
  }
  .featured .plate .name {
    font-family: var(--serif); font-weight: 500; font-size: 13px;
    letter-spacing: -0.005em; color: var(--ink);
    line-height: 1.15;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .featured .plate .state {
    margin-top: 1px;
    font-family: var(--mono); font-size: 8px; color: var(--ink-mute);
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  .featured.live   .plate .state { color: var(--terra-deep); font-weight: 600; }
  .featured.unread .plate .state { color: #8a5e10; font-weight: 600; }

  /* 邮件式 snippet（下半部分扩大——是你真正想看的聊天预览） */
  .featured .snippet {
    width: 100%; margin-top: 6px;
    font-family: var(--serif); font-style: italic;
    font-size: 12.5px; line-height: 1.45;
    color: var(--ink-soft);
    text-align: left;
    overflow-y: auto;
    max-height: 130px; min-height: 90px;
    padding: 6px 8px;
    background: var(--ivory-light);
    border-left: 2px solid var(--rule-deep);
    white-space: pre-wrap; word-break: break-word;
    scrollbar-width: thin; scrollbar-color: var(--rule-deep) transparent;
  }
  .featured .snippet::-webkit-scrollbar { width: 5px; }
  .featured .snippet::-webkit-scrollbar-thumb { background: var(--rule-deep); border-radius: 3px; }
  .featured .snippet::-webkit-scrollbar-track { background: transparent; }
  .featured.live .snippet   { color: var(--ink); border-left-color: var(--terra); }
  .featured.unread .snippet { border-left-color: #d99e3e; }

  /* ─── Residents grid (底部所有住户卡) ─── */
  .residents-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  /* ─── Trends charts ─── */
  .charts-grid {
    display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr);
    gap: 18px; margin-bottom: 36px;
  }
  .chart-card {
    background: var(--paper); border: 1px solid var(--rule);
    padding: 18px 20px 14px; position: relative;
  }
  .chart-card::before {
    content: ''; position: absolute; left: 0; top: 0; width: 3px; bottom: 0;
    background: var(--terra); opacity: 0.5;
  }
  .chart-head { margin-bottom: 14px; }
  .chart-head .eyebrow {
    font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--ink-mute);
  }
  .chart-head h3 {
    font-family: var(--serif); font-weight: 400; font-size: 18px;
    letter-spacing: -0.015em; margin-top: 4px; color: var(--ink);
  }
  .chart-body { height: 180px; }
  .chart-body svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .chart-legend {
    margin-top: 10px; display: flex; gap: 16px;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--ink-mute);
  }
  .chart-legend i.sw {
    display: inline-block; width: 10px; height: 10px; margin-right: 6px;
    vertical-align: middle; border-radius: 1px;
  }
  .chart-legend i.sw.ink { background: var(--ink); }
  .chart-legend i.sw.terra { background: var(--terra); }
  /* SVG 内部样式 */
  .chart-body .axis-label {
    font-family: var(--mono); font-size: 9px; fill: var(--ink-faint);
    letter-spacing: 0.05em;
  }
  .chart-body .axis-tick { stroke: var(--rule); stroke-width: 1; }
  .chart-body .bar.created { fill: var(--ink); opacity: 0.78; }
  .chart-body .bar.replied { fill: var(--terra); opacity: 0.85; }
  .chart-body .bar:hover { opacity: 1; }
  .chart-body .line.created { fill: none; stroke: var(--ink); stroke-width: 1.5; }
  .chart-body .line.replied { fill: none; stroke: var(--terra); stroke-width: 1.5; }
  .chart-body .dot.created { fill: var(--ink); }
  .chart-body .dot.replied { fill: var(--terra); }
  .chart-body .donut-label {
    font-family: var(--mono); font-size: 9.5px; fill: var(--ink-mute);
    letter-spacing: 0.1em; text-transform: uppercase;
  }
  .chart-body .donut-value {
    font-family: var(--serif); font-size: 26px; fill: var(--ink);
  }
  .chart-body .donut-key {
    font-family: var(--mono); font-size: 10px; fill: var(--ink-soft);
  }
  @media (max-width: 980px) {
    .charts-grid { grid-template-columns: 1fr; }
    .chart-body { height: 200px; }
  }

  .resident {
    background: var(--paper); border: 1px solid var(--rule);
    padding: 18px 20px 16px;
    cursor: pointer; display: flex; gap: 14px; align-items: center;
    transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .resident:hover {
    transform: translateY(-2px);
    border-color: var(--ink-soft);
    box-shadow: 0 8px 22px -12px rgba(31,26,20,0.2);
  }
  .resident .avatar { width: 44px; height: 44px; flex-shrink: 0; }
  .resident .body { flex: 1; min-width: 0; }
  .resident .body .name {
    font-family: var(--serif); font-weight: 500; font-size: 17px; line-height: 1.15;
    color: var(--ink); letter-spacing: -0.01em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .resident .body .meta {
    font-family: var(--mono); font-size: 9.5px; color: var(--ink-mute);
    margin-top: 4px; letter-spacing: 0.08em;
  }
  .resident .body .meta .sep { color: var(--ink-faint); margin: 0 6px; }
  .resident.live { border-color: var(--terra); background: linear-gradient(180deg, var(--paper) 0%, #fdf0ec 100%); }
  .resident.live .body .meta { color: var(--terra-deep); }
  .resident.unread { border-color: #d99e3e; background: linear-gradient(180deg, var(--paper) 0%, #fef5e3 100%); }
  .resident.unread .body .meta { color: var(--ink-soft); }
  .resident .body .meta .sep { color: var(--ink-faint); margin: 0 6px; }
  .resident .body .meta strong.hot { color: var(--terra-deep); font-weight: 600; font-family: var(--mono); font-style: normal; }
  .resident .body .meta .muted { color: var(--ink-faint); }
  .companion-mini .badge.unread { background: #d99e3e; color: var(--ink); }
  .companion-mini .badge.live { background: var(--terra); color: var(--paper); animation: pulse-soft 1.6s ease-in-out infinite; }

  /* ─── 细滾动条（drawer / composer / 任意滚动区） ─── */
  .drawer-scroll::-webkit-scrollbar,
  .composer textarea::-webkit-scrollbar {
    width: 8px;
  }
  .drawer-scroll::-webkit-scrollbar-track,
  .composer textarea::-webkit-scrollbar-track {
    background: transparent;
  }
  .drawer-scroll::-webkit-scrollbar-thumb,
  .composer textarea::-webkit-scrollbar-thumb {
    background: rgba(31, 26, 20, 0.18);
    border-radius: 4px;
  }
  .drawer-scroll::-webkit-scrollbar-thumb:hover,
  .composer textarea::-webkit-scrollbar-thumb:hover {
    background: rgba(31, 26, 20, 0.32);
  }
  .drawer-scroll, .composer textarea {
    scrollbar-width: thin;
    scrollbar-color: rgba(31, 26, 20, 0.22) transparent;
  }

  /* Drawer inbox 区 */
  .inbox-banner {
    margin: 0 32px 18px; padding: 14px 18px;
    border: 1px solid #d99e3e; background: #fef5e3;
    border-left: 3px solid #d99e3e;
    font-family: var(--mono); font-size: 11px; color: var(--ink);
    letter-spacing: 0.08em;
  }
  .inbox-banner h4 {
    font-family: var(--serif); font-weight: 500; font-size: 17px; letter-spacing: -0.01em;
    margin-bottom: 6px; color: var(--ink);
  }
  .inbox-banner .desc { font-family: var(--serif); font-style: italic; font-size: 13px; color: var(--ink-soft); margin-bottom: 12px; letter-spacing: 0; }
  .inbox-list { display: flex; flex-direction: column; gap: 8px; }
  .inbox-item {
    background: var(--paper); border: 1px solid var(--rule);
    padding: 10px 14px; font-family: var(--serif); font-size: 13.5px; line-height: 1.5;
    white-space: pre-wrap; word-break: break-word; color: var(--ink-soft);
  }
  .inbox-item .when {
    display: block; font-family: var(--mono); font-size: 9.5px; color: var(--ink-faint);
    text-transform: uppercase; letter-spacing: 0.18em; margin-bottom: 4px;
  }

  .empty {
    padding: 60px 24px; text-align: center;
    font-family: var(--serif); font-style: italic; font-size: 15px; color: var(--ink-mute);
  }

  /* ─── Drawer (聊天回放，居中模态风格) ─── */
  .drawer-mask {
    display: none; position: fixed; inset: 0; z-index: 90;
    background: rgba(31, 26, 20, 0.42); backdrop-filter: blur(6px);
  }
  .drawer-mask.open { display: block; animation: fade 0.25s ease-out; }
  .drawer {
    display: none; position: fixed; inset: 0; margin: auto; z-index: 95;
    width: min(880px, calc(100vw - 48px));
    height: min(86vh, calc(100vh - 48px));
    background: var(--ivory-light);
    border: 1px solid var(--ink); border-radius: 10px;
    box-shadow: 0 36px 90px -24px rgba(31, 26, 20, 0.45);
    flex-direction: column;
    transform: translateY(16px) scale(0.97); opacity: 0;
    transition: transform 0.28s cubic-bezier(0.2, 0.85, 0.3, 1), opacity 0.22s ease-out;
  }
  .drawer.open { display: flex; transform: translateY(0) scale(1); opacity: 1; }
  .drawer-scroll { flex: 1 1 auto; overflow-y: auto; }
  .drawer-head {
    padding: 28px 32px 20px; border-bottom: 1px solid var(--rule);
    background: var(--ivory-light); position: sticky; top: 0; z-index: 2;
    display: flex; gap: 18px; align-items: flex-start;
  }
  .drawer-head .avatar { width: 64px; height: 64px; flex-shrink: 0; }
  .drawer-head .head-info { flex: 1; min-width: 0; }
  .drawer-head .eyebrow {
    font-family: var(--mono); font-size: 9.5px; text-transform: uppercase;
    letter-spacing: 0.25em; color: var(--ink-mute); margin-bottom: 4px;
  }
  .drawer-head h2 {
    font-family: var(--serif); font-weight: 400; font-size: 32px; letter-spacing: -0.025em;
    line-height: 1.05;
  }
  .drawer-head .stats {
    margin-top: 10px; display: flex; gap: 18px; flex-wrap: wrap;
    font-family: var(--mono); font-size: 10px; color: var(--ink-mute);
    text-transform: uppercase; letter-spacing: 0.14em;
  }
  .drawer-head .stats span strong { color: var(--ink); font-weight: 600; }
  .drawer-head .close {
    background: transparent; border: 1px solid var(--rule); padding: 5px 11px;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; cursor: pointer;
    color: var(--ink-soft); text-transform: uppercase; transition: all 0.15s; flex-shrink: 0;
  }
  .drawer-head .close:hover { border-color: var(--ink); color: var(--ink); }
  .drawer-head .actions { display: flex; gap: 6px; flex-shrink: 0; }
  .drawer-head .actions button {
    background: transparent; border: 1px solid var(--rule); padding: 5px 11px;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; cursor: pointer;
    color: var(--ink-soft); text-transform: uppercase; transition: all 0.15s;
  }
  .drawer-head .actions button:hover { border-color: var(--ink); color: var(--ink); }
  .drawer-head .actions button.danger:hover { border-color: var(--terra); color: var(--terra); background: #fdf6f0; }
  .drawer-body { padding: 24px 32px 32px; }

  /* ─── Drawer composer (聊天底部输入条) ─── */
  .composer {
    flex: 0 0 auto; border-top: 1px solid var(--rule);
    background: var(--paper);
    padding: 14px 22px 14px 22px;
    display: flex; gap: 10px; align-items: flex-end;
  }
  .composer .target {
    flex: 0 0 auto; font-family: var(--mono); font-size: 9.5px;
    letter-spacing: 0.15em; text-transform: uppercase;
    color: var(--ink-mute); padding: 8px 10px 0 0; line-height: 1.3;
    max-width: 130px; word-break: break-all;
  }
  .composer .target.has-task { color: var(--terra); }
  .composer textarea {
    flex: 1 1 auto; min-height: 40px; max-height: 360px;
    background: var(--ivory-light); color: var(--ink);
    border: 1px solid var(--rule);
    padding: 10px 12px; font-family: var(--serif); font-size: 14px;
    line-height: 1.5; outline: none; resize: vertical;
    transition: border-color 0.15s;
  }
  .composer textarea:focus { border-color: var(--terra); }
  .composer textarea:disabled { background: var(--rule); color: var(--ink-mute); cursor: not-allowed; }
  .composer .send {
    flex: 0 0 auto; padding: 10px 20px; font-family: var(--mono);
    font-size: 10.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.15em; cursor: pointer;
    border: 1px solid var(--terra); background: var(--terra); color: var(--paper);
    transition: all 0.15s;
  }
  .composer .send:hover { background: var(--terra-deep); border-color: var(--terra-deep); }
  .composer .send:disabled { background: var(--rule); border-color: var(--rule); color: var(--ink-mute); cursor: not-allowed; }

  .load-more-row { text-align: center; margin: 4px 0 22px; }
  .load-more-btn {
    background: transparent; border: 1px solid var(--rule);
    padding: 7px 18px; font-family: var(--mono); font-size: 10.5px;
    letter-spacing: 0.18em; text-transform: uppercase; cursor: pointer;
    color: var(--ink-soft); transition: all 0.15s;
  }
  .load-more-btn:hover { border-color: var(--ink); color: var(--ink); background: var(--paper); }

  .turn { margin-bottom: 24px; animation: rise-slow 0.4s ease-out both; }
  .turn .turn-meta {
    font-family: var(--mono); font-size: 9.5px; text-transform: uppercase;
    letter-spacing: 0.18em; color: var(--ink-faint); margin-bottom: 6px;
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  }
  .turn .turn-meta .level { padding: 1px 7px; border: 1px solid currentColor; font-weight: 600; }
  .turn .turn-meta .level.ask { color: #c08a2b; }
  .turn .turn-meta .level.info { color: var(--ink-mute); }
  .turn .turn-meta .level.done { color: #5b9e8a; }
  .turn .turn-meta .level.error { color: var(--terra); }
  .turn .turn-meta .status-pending { color: #c08a2b; font-weight: 600; }
  .turn .turn-meta .status-replied { color: #5b9e8a; }
  .turn .turn-meta .status-expired,
  .turn .turn-meta .status-cancelled { color: var(--ink-faint); }

  .bubble {
    background: var(--paper); border: 1px solid var(--rule);
    padding: 13px 17px; font-family: var(--serif); font-size: 14.5px; line-height: 1.55;
    white-space: pre-wrap; word-break: break-word; position: relative;
  }
  .bubble.ai   { border-left: 3px solid var(--ink); }
  .bubble.user { border-left: 3px solid var(--terra); background: #fdf6f0; margin-top: 6px; margin-left: 28px; font-style: italic; color: var(--ink-soft); }
  .bubble .who {
    font-family: var(--mono); font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.22em; color: var(--ink-mute); margin-bottom: 6px;
  }
  .bubble.user .who { color: var(--terra-deep); }
  /* markdown 内部元素 */
  .bubble .md { white-space: normal; }
  .bubble .md p { margin: 0 0 0.6em; }
  .bubble .md p:last-child { margin-bottom: 0; }
  .bubble .md strong { font-weight: 600; color: var(--ink); }
  .bubble .md em { font-style: italic; }
  .bubble .md a { color: var(--terra-deep); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
  .bubble .md a:hover { color: var(--terra); }
  .bubble .md code {
    font-family: var(--mono); font-size: 12.5px; background: var(--ivory-deeper);
    padding: 1px 5px; border-radius: 2px; color: var(--ink); font-style: normal;
  }
  .bubble .md pre {
    background: var(--ink); color: var(--ivory-light); padding: 12px 14px;
    margin: 8px 0; overflow-x: auto; border-left: 3px solid var(--terra);
    font-family: var(--mono); font-size: 12px; line-height: 1.5;
  }
  .bubble .md pre code { background: transparent; color: inherit; padding: 0; font-size: inherit; }
  .bubble .md ul, .bubble .md ol { margin: 0 0 0.6em; padding-left: 22px; }
  .bubble .md li { margin: 0.15em 0; }
  .bubble .md blockquote {
    margin: 6px 0; padding: 4px 12px; border-left: 3px solid var(--rule-deep);
    color: var(--ink-mute); font-style: italic;
  }
  .bubble .md h1, .bubble .md h2, .bubble .md h3 {
    font-family: var(--serif); font-weight: 500; letter-spacing: -0.01em;
    margin: 8px 0 4px; line-height: 1.2;
  }
  .bubble .md h1 { font-size: 20px; }
  .bubble .md h2 { font-size: 17px; }
  .bubble .md h3 { font-size: 15px; }
  .bubble .md hr { border: none; border-top: 1px dashed var(--rule); margin: 10px 0; }
  .bubble .md table { border-collapse: collapse; margin: 8px 0; font-family: var(--mono); font-size: 12px; font-style: normal; }
  .bubble .md th, .bubble .md td { border: 1px solid var(--rule); padding: 4px 8px; text-align: left; }
  .bubble .md th { background: var(--ivory-deeper); font-weight: 600; }
  .bubble .md img { max-width: 100%; border: 1px solid var(--rule); margin: 6px 0; }

  .turn .actions { margin-top: 8px; margin-left: 28px; display: flex; gap: 8px; }
  .turn .actions button {
    background: transparent; border: 1px solid var(--rule-deep); color: var(--ink-soft);
    padding: 5px 12px; font-family: var(--mono); font-size: 10px; font-weight: 600;
    letter-spacing: 0.15em; text-transform: uppercase; cursor: pointer; transition: all 0.15s;
  }
  .turn .actions button:hover { border-color: var(--ink); color: var(--ink); }
  .turn .actions button.danger:hover { border-color: var(--terra); color: var(--terra); }

  /* ─── 气泡右上角 cancel 按钮（只在 pending 且未回复时出现） ─── */
  .bubble { position: relative; }
  .bubble .bubble-cancel {
    position: absolute; top: 8px; right: 10px;
    background: transparent; border: 1px solid transparent; color: var(--ink-faint);
    padding: 3px 8px; font-family: var(--mono); font-size: 9.5px; font-weight: 600;
    letter-spacing: 0.15em; text-transform: uppercase; cursor: pointer; transition: all 0.15s;
    opacity: 0; line-height: 1.2;
  }
  .bubble:hover .bubble-cancel { opacity: 1; }
  .bubble .bubble-cancel:hover { border-color: var(--terra); color: var(--terra); background: #fdf6f0; }
    background: transparent; border: 1px solid var(--rule);
    padding: 5px 11px; font-family: var(--mono); font-size: 9.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--ink-soft); cursor: pointer; transition: all 0.15s;
  }
  .turn .actions button:hover { border-color: var(--ink); color: var(--ink); }
  .turn .actions button.danger:hover { border-color: var(--terra); color: var(--terra); }

  /* ─── Modal ─── */
  .modal { display: none; position: fixed; inset: 0; background: rgba(31, 26, 20, 0.55); backdrop-filter: blur(8px); z-index: 110; align-items: center; justify-content: center; padding: 24px; }
  .modal.open { display: flex; animation: fade 0.2s ease-out; }
  .modal-box { background: var(--ivory-light); border: 1px solid var(--ink); padding: 30px; width: 540px; max-width: 100%; position: relative; box-shadow: 0 20px 60px -16px rgba(31, 26, 20, 0.4); }
  .modal-box::before { content: ''; position: absolute; left: 0; top: 0; width: 4px; bottom: 0; background: var(--terra); }
  .modal-box .eyebrow { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.25em; color: var(--ink-mute); margin-bottom: 8px; }
  .modal-box h3 { font-family: var(--serif); font-weight: 400; font-size: 26px; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 6px; }
  .modal-box h3 code { font-family: var(--mono); font-size: 20px; color: var(--terra); }
  .modal-box .hint { font-family: var(--serif); font-style: italic; font-size: 13px; color: var(--ink-mute); margin-bottom: 14px; }
  .modal-box .hint code { font-family: var(--mono); font-style: normal; font-size: 11px; color: var(--terra); padding: 1px 4px; background: var(--terra-soft); }
  .modal-box textarea { width: 100%; min-height: 110px; background: var(--paper); color: var(--ink); border: 1px solid var(--rule); padding: 13px; font-family: var(--serif); font-size: 14px; line-height: 1.5; outline: none; resize: vertical; }
  .modal-box textarea:focus { border-color: var(--terra); }
  .modal-actions { margin-top: 14px; display: flex; gap: 10px; justify-content: flex-end; }
  .modal-actions button { padding: 8px 20px; font-family: var(--mono); font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; cursor: pointer; border: 1px solid var(--rule-deep); background: transparent; color: var(--ink-soft); transition: all 0.15s; }
  .modal-actions button:hover { border-color: var(--ink); color: var(--ink); }
  .modal-actions .primary { background: var(--terra); color: var(--paper); border-color: var(--terra); }
  .modal-actions .primary:hover { background: var(--terra-deep); border-color: var(--terra-deep); }

  /* ─── Toast ─── */
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--ink); color: var(--ivory-light); border-left: 4px solid var(--terra); padding: 13px 20px; font-family: var(--mono); font-size: 11px; opacity: 0; transform: translateY(8px); transition: opacity 0.25s, transform 0.25s; z-index: 200; pointer-events: none; }
  .toast.show { opacity: 1; transform: translateY(0); }

  /* ─── Animations ─── */
  @keyframes rise      { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes rise-fast { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes rise-slow { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  @keyframes heartbeat {
    0%, 100% { box-shadow: 0 0 0 0 var(--terra-soft); }
    50%      { box-shadow: 0 0 0 8px transparent; }
  }
  /* Crew card animations */
  @keyframes float-idle {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes pet-bounce {
    0%, 100% { transform: translateY(0); }
    45%      { transform: translateY(-8px); }
    55%      { transform: translateY(-8px); }
  }
  @keyframes speech-bob {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-3px); }
  }
  @keyframes lamp-pulse {
    0%, 100% { box-shadow: 0 0 8px currentColor, 0 0 0 0 rgba(91, 158, 138, 0.45); }
    50%      { box-shadow: 0 0 8px currentColor, 0 0 0 6px rgba(91, 158, 138, 0); }
  }
  @keyframes badge-pop {
    from { opacity: 0; transform: scale(0.6); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes look-at-you {
    /* 角色头部缓慢左右扭动 — 通过整体 skewY 模拟 "注视" */
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25%      { transform: translateY(-3px) rotate(-1.5deg); }
    50%      { transform: translateY(-6px) rotate(0deg); }
    75%      { transform: translateY(-3px) rotate(1.5deg); }
  }
  @keyframes gentle-wave {
    /* unread 状态：轻轻招手 */
    0%, 100% { transform: rotate(0deg); }
    50%      { transform: rotate(0.8deg); }
  }
  @keyframes ring-drop {
    from { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.85); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1); }
  }
  @keyframes ring-pulse {
    0%, 100% { box-shadow: 0 4px 14px -6px rgba(31,26,20,0.22), 0 0 0 0 rgba(196, 69, 54, 0.35); }
    50%      { box-shadow: 0 4px 14px -6px rgba(31,26,20,0.22), 0 0 0 10px rgba(196, 69, 54, 0); }
  }
  @keyframes bubble-pop {
    from { opacity: 0; transform: scale(0.7) translateY(6px); transform-origin: bottom left; }
    to   { opacity: 1; transform: scale(1)   translateY(0); }
  }
  @keyframes blink-eyes {
    0%, 92%, 100% { transform: scaleY(1); }
    95%           { transform: scaleY(0.1); }
  }

  @media (max-width: 900px) {
    .hero { flex-direction: column; align-items: flex-start; gap: 14px; }
    .hero h1 { font-size: 44px; }
    .hero .signal { text-align: left; }
    .featured-grid, .residents-grid { grid-template-columns: 1fr; }
    .drawer { width: calc(100vw - 16px); height: calc(100vh - 16px); border-radius: 6px; }
  }
</style>
</head>
<body>
<div class="shell">

  <header class="hero">
    <div>
      <div class="greeting" id="greeting">Good evening</div>
      <h1>Your <em>Companions</em></h1>
    </div>
    <div class="signal">
      <div><span class="pulse"></span>BRIDGE ONLINE</div>
      <time id="lastUpdate">&mdash;</time>
    </div>
  </header>

  <div class="section-title" id="featured-title" style="display:none">
    <h2>Need <em>your attention</em></h2>
    <span class="count" id="featured-count">&mdash;</span>
  </div>
  <div class="featured-grid" id="featured-grid"></div>

  <!-- ─── Trends 区（图表） ─── -->
  <div class="section-title">
    <h2><em>Trends</em></h2>
    <span class="count" id="charts-updated">&mdash;</span>
  </div>
  <div class="charts-grid">
    <div class="chart-card chart-wide">
      <div class="chart-head"><span class="eyebrow">Past 24 hours</span><h3>Hourly activity</h3></div>
      <div class="chart-body" id="chart-hourly"></div>
      <div class="chart-legend"><span><i class="sw ink"></i>Cards sent</span><span><i class="sw terra"></i>You replied</span></div>
    </div>
    <div class="chart-card chart-wide">
      <div class="chart-head"><span class="eyebrow">Past 14 days</span><h3>Daily trend</h3></div>
      <div class="chart-body" id="chart-daily"></div>
      <div class="chart-legend"><span><i class="sw ink"></i>Cards sent</span><span><i class="sw terra"></i>You replied</span></div>
    </div>
    <div class="chart-card chart-narrow">
      <div class="chart-head"><span class="eyebrow">All time</span><h3>Status mix</h3></div>
      <div class="chart-body" id="chart-status"></div>
    </div>
  </div>

  <div class="section-title">
    <h2>All <em>companions</em></h2>
    <span class="count" id="resident-count">&mdash;</span>
    <div class="right">
      <input id="agent-filter" type="text" placeholder="find a companion...">
      <select id="sort-by" class="sort-select">
        <option value="active">Sort · Recently active</option>
        <option value="turns">Sort · Most chatty (turns)</option>
        <option value="created">Sort · Newest project</option>
        <option value="oldest">Sort · Oldest project</option>
        <option value="name">Sort · Name A→Z</option>
      </select>
      <label class="toggle"><input type="checkbox" id="auto-refresh" checked> Auto &middot; 5s</label>
    </div>
  </div>
  <div class="residents-grid" id="residents-grid"></div>

</div>

<!-- Drawer -->
<div class="drawer-mask" id="drawer-mask" onclick="closeDrawer()"></div>
<aside class="drawer" id="drawer">
  <div class="drawer-scroll" id="drawer-scroll">
    <div class="drawer-head">
      <div class="avatar" id="drawer-avatar"></div>
      <div class="head-info">
        <div class="eyebrow">CONVERSATION</div>
        <h2 id="drawer-title">&mdash;</h2>
        <div class="stats" id="drawer-stats"></div>
      </div>
      <div class="actions">
        <button onclick="clearUnreadCurrent()" title="Mark all unread offline messages as read">Clear unread</button>
        <button class="danger" onclick="deleteAgentCurrent()" title="Permanently delete this agent + all tasks + unread messages">Delete agent</button>
        <button class="close" onclick="closeDrawer()">Close</button>
      </div>
    </div>
    <div id="drawer-inbox"></div>
    <div class="drawer-body" id="drawer-body"></div>
  </div>
  <div class="composer" id="drawer-composer">
    <div class="target" id="composer-target">no pending task</div>
    <textarea id="composer-text" placeholder="No AI is waiting on a card right now." rows="1" disabled></textarea>
    <button class="send" id="composer-send" onclick="sendComposerReply()" disabled>Send</button>
  </div>
</aside>

<!-- Modal -->
<div class="modal" id="reply-modal">
  <div class="modal-box">
    <div class="eyebrow">Manual Intervention</div>
    <h3>Reply to <code id="reply-task-id"></code></h3>
    <p class="hint">Delivered to the waiting AI with <code>[人工/dashboard]</code> prefix. If no waiter, it joins pending_replies.</p>
    <textarea id="reply-text" placeholder="Type your response..."></textarea>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitReply()">Send</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const state = { agents: [], filter: '', sortBy: 'active', currentProject: null, currentLimit: 20, preview: new Map() };

// ── Avatar generator ─────────────────────────────────────
// 给每个 project 生成确定性的几何 mascot 头像
// 颜色：12 色调色板按 name hash 选
// 形状：6 种基本几何（圆 / 方 / 三角 / 圆角方 / 菱形 / 半圆）按 hash 选
// 眼睛：始终两个，位置和形状随 hash 变化，让每只都不一样

const PALETTE = ['#d0644b','#d99e3e','#b8a52a','#82a05e','#5b9e8a','#4b8aa7','#6f6dc4','#a564a9','#c75b8d','#a0866b','#7c8a7d','#cc8c46'];

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarSVG(projectName, sizePx) {
  const h = hashString(projectName);
  const color = PALETTE[h % PALETTE.length];
  const shapeIdx = (h >> 4) % 5;
  const eyeStyle = (h >> 8) % 4;
  const mouthStyle = (h >> 12) % 4;
  const tilt = ((h >> 16) % 11) - 5; // -5..+5 deg

  // background shape
  let bg = '';
  if (shapeIdx === 0)       bg = '<circle cx="32" cy="32" r="30" fill="' + color + '"/>';
  else if (shapeIdx === 1)  bg = '<rect x="4" y="4" width="56" height="56" rx="6" fill="' + color + '"/>';
  else if (shapeIdx === 2)  bg = '<rect x="4" y="4" width="56" height="56" rx="20" fill="' + color + '"/>';
  else if (shapeIdx === 3)  bg = '<path d="M32 4 L60 32 L32 60 L4 32 Z" fill="' + color + '"/>'; // diamond
  else                      bg = '<path d="M4 16 Q4 4 16 4 L48 4 Q60 4 60 16 L60 48 Q60 60 48 60 L16 60 Q4 60 4 48 Z" fill="' + color + '"/>'; // squircle

  // eyes — 2 个圆点或竖线
  let eyes;
  if (eyeStyle === 0)      eyes = '<circle cx="23" cy="28" r="3.5" fill="#1f1a14"/><circle cx="41" cy="28" r="3.5" fill="#1f1a14"/>';
  else if (eyeStyle === 1) eyes = '<rect x="20" y="24" width="6" height="10" rx="3" fill="#1f1a14"/><rect x="38" y="24" width="6" height="10" rx="3" fill="#1f1a14"/>'; // tall capsules
  else if (eyeStyle === 2) eyes = '<rect x="20" y="27" width="7" height="3" fill="#1f1a14"/><rect x="37" y="27" width="7" height="3" fill="#1f1a14"/>'; // sleepy
  else                     eyes = '<circle cx="24" cy="28" r="4" fill="#fbf8f1"/><circle cx="40" cy="28" r="4" fill="#fbf8f1"/><circle cx="24" cy="28" r="2" fill="#1f1a14"/><circle cx="40" cy="28" r="2" fill="#1f1a14"/>';

  // mouth
  let mouth;
  if (mouthStyle === 0)      mouth = '<path d="M24 42 Q32 48 40 42" stroke="#1f1a14" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  else if (mouthStyle === 1) mouth = '<rect x="26" y="42" width="12" height="3" rx="1.5" fill="#1f1a14"/>';
  else if (mouthStyle === 2) mouth = '<path d="M26 44 L38 44 L32 49 Z" fill="#1f1a14"/>'; // small triangle
  else                       mouth = '<circle cx="32" cy="44" r="2.6" fill="#1f1a14"/>';

  // antenna (subtle, top center)
  const antenna = '<line x1="32" y1="0" x2="32" y2="6" stroke="' + color + '" stroke-width="2"/><circle cx="32" cy="0.5" r="1.8" fill="' + color + '"/>';

  return '<svg viewBox="0 0 64 64" width="' + sizePx + '" height="' + sizePx + '" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;transform:rotate(' + tilt + 'deg)">' +
         antenna + bg + eyes + mouth + '</svg>';
}

// ── Character (full body) ────────────────────────────────
// 给 featured 区用：每个 agent 是一只全身的小机器人/角色
// viewBox 100x150；颜色和形状由 project_name hash 决定，复用 PALETTE
// 各部位：天线 → 头 (脸：眼 + 嘴) → 身体 → 双手 → 双腿
function characterSVG(projectName, w, h) {
  const hh = hashString(projectName);
  const color = PALETTE[hh % PALETTE.length];
  const bodyColor = PALETTE[(hh >> 4) % PALETTE.length];
  const headShape = (hh >> 8) % 3;       // 0 = 圆头  1 = 圆角方头  2 = 钻石头
  const bodyShape = (hh >> 12) % 3;      // 0 = 圆角方  1 = 椭圆胶囊  2 = 梯形
  const eyeStyle  = (hh >> 16) % 4;
  const mouthStyle = (hh >> 20) % 4;
  const armPose   = (hh >> 24) % 3;      // 0 = 自然下垂  1 = 一只手抬起  2 = 两只都张开

  // === 头 (中心 50, 30 半径 22) ===
  let head;
  if (headShape === 0)      head = '<circle cx="50" cy="30" r="22" fill="' + color + '"/>';
  else if (headShape === 1) head = '<rect x="28" y="9" width="44" height="42" rx="9" fill="' + color + '"/>';
  else                       head = '<path d="M50 8 L72 30 L50 52 L28 30 Z" fill="' + color + '"/>';

  // 天线
  const antenna =
    '<line x1="50" y1="0" x2="50" y2="10" stroke="' + color + '" stroke-width="2.4"/>' +
    '<circle cx="50" cy="1" r="2.4" fill="' + color + '"/>';

  // 眼睛 (默认中心 y=28, 距离 13)
  let eyes;
  if (eyeStyle === 0)      eyes = '<g class="eyes" style="transform-origin:50px 28px;animation:blink-eyes 5.5s ease-in-out infinite"><circle cx="43" cy="28" r="3.2" fill="#1f1a14"/><circle cx="57" cy="28" r="3.2" fill="#1f1a14"/></g>';
  else if (eyeStyle === 1) eyes = '<g class="eyes" style="transform-origin:50px 28px;animation:blink-eyes 5.5s ease-in-out infinite"><rect x="40" y="24" width="6" height="9" rx="3" fill="#1f1a14"/><rect x="54" y="24" width="6" height="9" rx="3" fill="#1f1a14"/></g>';
  else if (eyeStyle === 2) eyes = '<g class="eyes"><circle cx="43" cy="28" r="4" fill="#fbf8f1"/><circle cx="57" cy="28" r="4" fill="#fbf8f1"/><circle cx="43" cy="28" r="2" fill="#1f1a14"/><circle cx="57" cy="28" r="2" fill="#1f1a14"/></g>';
  else                     eyes = '<g class="eyes"><rect x="40" y="27" width="7" height="2.5" fill="#1f1a14"/><rect x="53" y="27" width="7" height="2.5" fill="#1f1a14"/></g>';

  // 嘴
  let mouth;
  if (mouthStyle === 0)      mouth = '<path d="M43 40 Q50 45 57 40" stroke="#1f1a14" stroke-width="2" fill="none" stroke-linecap="round"/>';
  else if (mouthStyle === 1) mouth = '<rect x="45" y="40" width="10" height="2.5" rx="1.25" fill="#1f1a14"/>';
  else if (mouthStyle === 2) mouth = '<path d="M45 42 L55 42 L50 47 Z" fill="#1f1a14"/>';
  else                       mouth = '<circle cx="50" cy="42" r="2.4" fill="#1f1a14"/>';

  // === 身体 (在头下面 y=55..100) ===
  let body;
  if (bodyShape === 0)      body = '<rect x="34" y="56" width="32" height="44" rx="6" fill="' + bodyColor + '"/>';
  else if (bodyShape === 1) body = '<rect x="32" y="56" width="36" height="44" rx="18" fill="' + bodyColor + '"/>';
  else                      body = '<path d="M30 100 L40 56 L60 56 L70 100 Z" fill="' + bodyColor + '"/>';

  // 胸口装饰 (小圆点/灯)
  const chestLight = '<circle cx="50" cy="74" r="3" fill="' + color + '"/><circle cx="50" cy="74" r="1.4" fill="#fbf8f1"/>';

  // === 手 ===
  let arms;
  if (armPose === 0) {
    // 两手自然下垂
    arms =
      '<rect x="22" y="62" width="8" height="30" rx="4" fill="' + color + '" transform="rotate(-8 26 62)"/>' +
      '<rect x="70" y="62" width="8" height="30" rx="4" fill="' + color + '" transform="rotate(8 74 62)"/>' +
      '<circle cx="20" cy="92" r="5" fill="' + color + '"/><circle cx="80" cy="92" r="5" fill="' + color + '"/>';
  } else if (armPose === 1) {
    // 右手挥起
    arms =
      '<rect x="22" y="62" width="8" height="30" rx="4" fill="' + color + '" transform="rotate(-8 26 62)"/>' +
      '<rect x="70" y="42" width="8" height="30" rx="4" fill="' + color + '" transform="rotate(28 74 62)"/>' +
      '<circle cx="20" cy="92" r="5" fill="' + color + '"/><circle cx="92" cy="46" r="5" fill="' + color + '"/>';
  } else {
    // 两手都张开
    arms =
      '<rect x="14" y="58" width="8" height="30" rx="4" fill="' + color + '" transform="rotate(-28 18 62)"/>' +
      '<rect x="78" y="58" width="8" height="30" rx="4" fill="' + color + '" transform="rotate(28 82 62)"/>' +
      '<circle cx="6" cy="90" r="5" fill="' + color + '"/><circle cx="94" cy="90" r="5" fill="' + color + '"/>';
  }

  // === 腿 + 脚 ===
  const legs =
    '<rect x="38" y="100" width="9" height="22" rx="4" fill="' + color + '"/>' +
    '<rect x="53" y="100" width="9" height="22" rx="4" fill="' + color + '"/>' +
    '<ellipse cx="42.5" cy="125" rx="9" ry="4" fill="#1f1a14"/>' +
    '<ellipse cx="57.5" cy="125" rx="9" ry="4" fill="#1f1a14"/>';

  return '<svg viewBox="0 0 100 135" width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">' +
         antenna +
         body +
         chestLight +
         arms +
         legs +
         head +
         eyes +
         mouth +
         '</svg>';
}

// ── Time helpers ─────────────────────────────────────────
function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2,'0');
  return pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtRelative(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s/60) + 'm ago';
  if (s < 86400) return Math.round(s/3600) + 'h ago';
  if (s < 86400 * 30) return Math.round(s/86400) + 'd ago';
  return Math.round(s/86400/30) + 'mo ago';
}
function fmtDuration(start, end) {
  if (!start || !end) return '—';
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.round(sec/60) + 'm';
  if (sec < 86400) return Math.round(sec/3600) + 'h';
  return Math.round(sec/86400) + 'd';
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Mini Markdown renderer ─────────────────────────────────
// 支持：headings, bold, italic, inline code, fenced code blocks,
// blockquotes, ul/ol lists, links, hr, line breaks, paragraphs
// 不支持：嵌套列表、表格、复杂场景（够 dashboard 用就行）
function renderMarkdown(src) {
  if (!src) return '';
  let s = String(src);
  // 1) Pull out fenced code blocks first so inline rules don't touch them
  const codeBlocks = [];
  s = s.replace(/\`\`\`([^\\n]*)\\n([\\s\\S]*?)\`\`\`/g, function(_m, _lang, code) {
    codeBlocks.push('<pre><code>' + escapeHtml(code) + '</code></pre>');
    return '\\u0000CODE' + (codeBlocks.length - 1) + '\\u0000';
  });
  // 2) Escape everything, then re-introduce markdown HTML
  s = escapeHtml(s);
  // 3) Headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>')
       .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
       .replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  // 4) Horizontal rule
  s = s.replace(/^---+$/gm, '<hr>');
  // 5) Blockquote (single level)
  s = s.replace(/(^&gt; .*(?:\\n&gt; .*)*)/gm, function(block) {
    const lines = block.split(/\\n/).map(function(l){ return l.replace(/^&gt; ?/, ''); }).join('\\n');
    return '<blockquote>' + lines + '</blockquote>';
  });
  // 6) Lists
  s = s.replace(/(?:^[\\-\\*] .+(?:\\n[\\-\\*] .+)*)/gm, function(block) {
    const items = block.split(/\\n/).map(function(l){
      return '<li>' + l.replace(/^[\\-\\*] /, '') + '</li>';
    }).join('');
    return '<ul>' + items + '</ul>';
  });
  s = s.replace(/(?:^\\d+\\. .+(?:\\n\\d+\\. .+)*)/gm, function(block) {
    const items = block.split(/\\n/).map(function(l){
      return '<li>' + l.replace(/^\\d+\\. /, '') + '</li>';
    }).join('');
    return '<ol>' + items + '</ol>';
  });
  // 7) Inline
  s = s.replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>');
  s = s.replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![\\*\\w])\\*([^*\\n]+)\\*(?!\\*)/g, '<em>$1</em>');
  s = s.replace(/!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)/g, '<img alt="$1" src="$2">');
  s = s.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 8) Paragraphs
  const paras = s.split(/\\n{2,}/).map(function(p) {
    if (/^<(h\\d|ul|ol|pre|blockquote|hr|table|img)/.test(p.trim())) return p;
    return '<p>' + p.replace(/\\n/g, '<br>') + '</p>';
  });
  s = paras.join('\\n');
  // 9) Restore code blocks
  s = s.replace(/\\u0000CODE(\\d+)\\u0000/g, function(_m, i) { return codeBlocks[+i] || ''; });
  return s;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2400);
}
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const t = await r.text(); if (t) msg = t; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── Greeting based on hour ───────────────────────────────
(function() {
  const h = new Date().getHours();
  let g = 'Good evening';
  if (h < 5) g = 'Up late';
  else if (h < 12) g = 'Good morning';
  else if (h < 18) g = 'Good afternoon';
  document.getElementById('greeting').textContent = g + '.';
})();

// ── Render ───────────────────────────────────────────────
async function loadAgents() {
  const r = await fetchJSON('/api/dashboard/agents');
  state.agents = r.agents;
  renderFeatured();
  renderResidents();
}

function statusOf(a) {
  if (a.has_live_waiter) return 'live';
  if (Number(a.unread_replies) > 0) return 'unread';
  if (Number(a.orphan_pending) > 0) return 'orphan';
  if (a.last_seen && Date.now() - a.last_seen > 7 * 86400 * 1000) return 'sleeping';
  return 'idle';
}

// 需要关注 = 有 live waiter (AI 正在等) OR 有未消费的离线消息
function needsAttention(a) {
  return Boolean(a.has_live_waiter) || Number(a.unread_replies) > 0;
}

function renderDock() {
  const dock = document.getElementById('dock');
  document.getElementById('dock-count').textContent = state.agents.length + ' total';
  const fp = state.agents.map(a => a.project_name + ':' + a.pending + ':' + a.unread_replies + ':' + a.has_live_waiter + ':' + a.last_seen).join('|');
  if (dock.dataset.fp === fp) return;
  const isFirst = !dock.dataset.fp;
  dock.dataset.fp = fp;
  dock.innerHTML = state.agents.map((a, i) => {
    const stat = statusOf(a);
    // badge 优先显示未读离线消息（你最该处理的），其次显示 live waiting
    let badge = '';
    if (Number(a.unread_replies) > 0) {
      badge = '<span class="badge unread">' + a.unread_replies + '</span>';
    } else if (a.has_live_waiter) {
      badge = '<span class="badge live">&middot;</span>';
    }
    const delay = isFirst ? Math.min(i * 30, 600) : 0;
    return '<div class="companion-mini ' + stat + '" style="animation-delay:' + delay + 'ms" onclick="openDrawer(\\'' + encodeURIComponent(a.project_name) + '\\')">' +
      '<div class="avatar">' + avatarSVG(a.project_name, 54) + badge +
        (stat === 'live' ? '<div class="heartbeat"></div>' : '') +
      '</div>' +
      '<div class="label">' + escapeHtml(a.project_name.length > 10 ? a.project_name.slice(0,9) + '…' : a.project_name) + '</div>' +
    '</div>';
  }).join('');
}

async function loadPreviewFor(project) {
  if (state.preview.has(project)) return state.preview.get(project);
  try {
    const r = await fetchJSON('/api/dashboard/agent/' + encodeURIComponent(project) + '/history?limit=3');
    const msg = (r.tasks[0] && r.tasks[0].message) || '';
    state.preview.set(project, msg);
    return msg;
  } catch { return ''; }
}

async function renderFeatured() {
  // "需要关注" = 有 live waiter (AI 正在等) OR 有未消费的离线消息
  const featured = state.agents.filter(needsAttention);
  document.getElementById('featured-title').style.display = featured.length ? '' : 'none';
  document.getElementById('featured-count').textContent = featured.length + ' awaiting';
  const grid = document.getElementById('featured-grid');
  if (!featured.length) {
    grid.innerHTML = '';
    grid.dataset.fp = '';
    return;
  }

  const fp = featured.map(a => a.project_name + ':' + a.unread_replies + ':' + a.has_live_waiter + ':' + a.orphan_pending + ':' + a.last_seen).join('|');
  if (grid.dataset.fp === fp) return;
  grid.dataset.fp = fp;

  grid.innerHTML = featured.map(a => {
    const isLive = !!a.has_live_waiter;
    const unread = Number(a.unread_replies) || 0;
    const kind = isLive ? 'live' : (unread > 0 ? 'unread' : '');
    const pet = petForState(a);
    // 状态行（名牌下小字）
    let stateLine;
    if (isLive && unread)   stateLine = 'LIVE · ' + unread + ' UNREAD';
    else if (isLive)        stateLine = 'LIVE · ' + fmtRelative(a.last_seen).toUpperCase();
    else if (unread)        stateLine = unread + ' UNREAD';
    else                    stateLine = 'IDLE';
    // 右上角 statepill（数字居中 / LIVE 显示双标）
    let pillText;
    if (isLive && unread)   pillText = '<span class="dot"></span>LIVE · ' + unread;
    else if (isLive)        pillText = '<span class="dot"></span>LIVE';
    else if (unread)        pillText = unread + ' new';
    else                    pillText = '';
    const statepill = pillText
      ? '<div class="statepill" onclick="event.stopPropagation(); openReplyByProject(\\'' + encodeURIComponent(a.project_name) + '\\')">' + pillText + '</div>'
      : '';
    // 左上角 🧹 扫把（仅当有未读时显示）
    const broom = unread > 0
      ? '<button class="broom" title="Mark unread as read" onclick="event.stopPropagation(); clearUnread(\\'' + encodeURIComponent(a.project_name) + '\\')">\u2702</button>'
      : '';
    // 右上角 × 删除（LIVE 时禁用，防止误杀正在工作的 agent）
    const delBtn = isLive
      ? '<button class="corner-act disabled" title="Cannot delete: AI is currently waiting (LIVE)" onclick="event.stopPropagation(); showToast(\\'Cannot delete a LIVE agent. Reply or cancel first.\\')">\u00D7</button>'
      : '<button class="corner-act" title="Delete this agent (irreversible)" onclick="event.stopPropagation(); deleteAgentByName(\\'' + encodeURIComponent(a.project_name) + '\\')">\u00D7</button>';
    const safeName = escapeHtml(a.project_name);
    const safeEnc  = encodeURIComponent(a.project_name);
    return '<article class="featured ' + kind + '" data-project="' + safeName + '" onclick="openDrawer(\\'' + safeEnc + '\\')">' +
      broom +
      delBtn +
      statepill +
      '<div class="pet-stage">' +
        '<img src="https://cdn.jsdelivr.net/gh/abderrahimghazali/clawd-pet@main/public/pets/' + pet + '.svg" alt="' + escapeHtml(pet) + '" loading="lazy" onerror="this.src=\\'https://cdn.jsdelivr.net/gh/abderrahimghazali/clawd-pet@main/public/pets/clawd-cool.svg\\'">' +
      '</div>' +
      '<div class="plate">' +
        '<div class="name">' + safeName + '</div>' +
        '<div class="state">' + escapeHtml(stateLine) + '</div>' +
      '</div>' +
      '<div class="snippet" data-snippet-slot>&hellip;</div>' +
    '</article>';
  }).join('');

  // 异步加 snippet（plain-text 邮件预览风）
  for (const a of featured) {
    loadPreviewFor(a.project_name).then(msg => {
      const card = grid.querySelector('article[data-project="' + CSS.escape(a.project_name) + '"]');
      if (card) {
        const slot = card.querySelector('[data-snippet-slot]');
        if (slot) {
          // 去 markdown 符号 + 取首句压成单行
          const plain = stripMarkdown(msg || '');
          slot.textContent = plain ? plain : 'No transcript yet.';
        }
      }
    });
  }
}

// 去除 markdown 标记，把多行折叠成单行（用于 dashboard 卡片 1 行 snippet）
function stripMarkdown(src) {
  if (!src) return '';
  return String(src)
    .replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' [code] ')    // fenced code
    .replace(/\`([^\`\\n]+)\`/g, '$1')                  // inline code
    .replace(/!\\[[^\\]]*\\]\\([^)]+\\)/g, ' [img] ')   // image
    .replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g, '$1')       // link
    .replace(/^\\s*[-*+]\\s+/gm, '• ')                  // list bullet
    .replace(/^\\s*\\d+\\.\\s+/gm, '')                  // ordered list
    .replace(/^#{1,6}\\s+/gm, '')                       // headings
    .replace(/\\*\\*([^*]+)\\*\\*/g, '$1')              // bold
    .replace(/\\*([^*\\n]+)\\*/g, '$1')                 // italic
    .replace(/^>\\s*/gm, '')                            // blockquote
    .replace(/^---+$/gm, '')                            // hr
    .replace(/[ \\t]+/g, ' ')                           // 折叠水平空白但保留 \\n
    .replace(/\\n{3,}/g, '\\n\\n')                      // 限制连续空行
    .trim();
}

// 清空某 agent 的未读离线消息（mark as read）
async function clearUnread(encodedName) {
  const project = decodeURIComponent(encodedName);
  if (!confirm('Mark all unread messages of "' + project + '" as read?\\n\\nThe messages stay in the inbox view but won\\'t count anymore.')) return;
  try {
    const r = await fetchJSON('/api/dashboard/agent/' + encodeURIComponent(project) + '/clear-unread', { method: 'POST' });
    showToast('Cleared ' + r.cleared + ' unread.');
    refresh();
  } catch (e) {
    showToast('Clear failed: ' + e.message);
  }
}

// 从 drawer 顶上点 — 用当前打开的 project
async function clearUnreadCurrent() {
  if (!state.currentProject) return;
  await clearUnread(encodeURIComponent(state.currentProject));
}

// 删除一个 agent（彻底清 db）
async function deleteAgentCurrent() {
  const project = state.currentProject;
  if (!project) return;
  await doDeleteAgent(project, true);
}
async function deleteAgentByName(encodedName) {
  const project = decodeURIComponent(encodedName);
  await doDeleteAgent(project, false);
}
async function doDeleteAgent(project, closeAfter) {
  const ok = confirm(
    'PERMANENTLY DELETE agent "' + project + '" ?\\n\\n' +
    'This will:\\n' +
    '  • Delete ALL tasks (history wiped)\\n' +
    '  • Drop ALL unread offline messages\\n' +
    '  • Forget the feishu chat mapping (next message from this project re-creates a fresh group)\\n\\n' +
    'NOT REVERSIBLE.'
  );
  if (!ok) return;
  try {
    const r = await fetchJSON('/api/dashboard/agent/' + encodeURIComponent(project), { method: 'DELETE' });
    showToast('Deleted ' + r.deleted.tasks + ' tasks, ' + r.deleted.replies + ' unread.');
    if (closeAfter) closeDrawer();
    refresh();
  } catch (e) {
    showToast('Delete failed: ' + e.message);
  }
}

// ── Pet selection ────────────────────────────────────────
// 按 agent 当前状态选 clawd-pet 表情；同一 project 用 hash 加点变化避免全员同款
const PET_LIVE       = ['clawd-waving', 'clawd-mindblown', 'clawd-juggling'];
const PET_UNREAD     = ['clawd-coding', 'clawd-typing', 'clawd-building', 'clawd-debugger'];
const PET_THINKING   = ['clawd-thinking', 'clawd-shrug', 'clawd-wizard'];
const PET_SLEEPING   = ['clawd-sleeping'];
const PET_IDLE       = ['clawd-cool', 'clawd-yoga', 'clawd-happy'];

function petForState(a) {
  const h = hashString(a.project_name);
  if (a.has_live_waiter)                                   return PET_LIVE[h % PET_LIVE.length];
  if (Number(a.unread_replies) > 0)                        return PET_UNREAD[h % PET_UNREAD.length];
  if (a.last_seen && Date.now() - a.last_seen > 7 * 86400 * 1000) return PET_SLEEPING[0];
  if (Number(a.orphan_pending) > 0)                        return PET_THINKING[h % PET_THINKING.length];
  return PET_IDLE[h % PET_IDLE.length];
}

function renderResidents() {
  const grid = document.getElementById('residents-grid');
  const filter = state.filter.toLowerCase().trim();
  let list = filter
    ? state.agents.filter(a => a.project_name.toLowerCase().includes(filter))
    : state.agents.slice();
  // 排序
  const sortBy = state.sortBy || 'active';
  list.sort((a, b) => {
    if (sortBy === 'turns')   return (b.total || 0) - (a.total || 0);
    if (sortBy === 'created') return (b.first_seen || 0) - (a.first_seen || 0);
    if (sortBy === 'oldest')  return (a.first_seen || 0) - (b.first_seen || 0);
    if (sortBy === 'name')    return String(a.project_name).localeCompare(String(b.project_name));
    /* active (default) */    return (b.last_seen || 0) - (a.last_seen || 0);
  });
  document.getElementById('resident-count').textContent = list.length + ' shown';
  if (!list.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No companions match.</div>';
    grid.dataset.fp = 'empty';
    return;
  }
  const fp = filter + '#' + sortBy + '#' + list.map(a => a.project_name + ':' + a.unread_replies + ':' + a.orphan_pending + ':' + a.has_live_waiter + ':' + a.last_seen + ':' + a.total).join('|');
  if (grid.dataset.fp === fp) return;
  grid.dataset.fp = fp;
  grid.innerHTML = list.map(a => {
    const stat = statusOf(a);
    const liveClass = stat === 'live' ? 'live' : (stat === 'unread' ? 'unread' : '');
    const sep = '<span class="sep">&middot;</span>';
    let metaText = a.total + ' turns ' + sep + ' ';
    if (a.has_live_waiter) metaText += '<strong class="hot">LIVE</strong> ' + sep + ' ';
    if (Number(a.unread_replies) > 0) metaText += '<strong class="hot">' + a.unread_replies + ' unread</strong> ' + sep + ' ';
    if (Number(a.orphan_pending) > 0) metaText += '<span class="muted">' + a.orphan_pending + ' orphan</span> ' + sep + ' ';
    metaText += fmtRelative(a.last_seen);
    const pet = petForState(a);
    return '<div class="resident ' + liveClass + '" onclick="openDrawer(\\'' + encodeURIComponent(a.project_name) + '\\')">' +
      '<div class="avatar"><img src="https://cdn.jsdelivr.net/gh/abderrahimghazali/clawd-pet@main/public/pets/' + pet + '.svg" alt="' + escapeHtml(pet) + '" loading="lazy" style="width:100%;height:100%;image-rendering:pixelated" onerror="this.src=\\'https://cdn.jsdelivr.net/gh/abderrahimghazali/clawd-pet@main/public/pets/clawd-cool.svg\\'"></div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(a.project_name) + '</div>' +
        '<div class="meta">' + metaText + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Drawer ───────────────────────────────────────────────
const HISTORY_INITIAL_LIMIT = 20;
const HISTORY_PAGE_STEP = 30;

async function openDrawer(encodedName) {
  const project = decodeURIComponent(encodedName);
  state.currentProject = project;
  state.currentLimit = HISTORY_INITIAL_LIMIT;
  document.getElementById('drawer-avatar').innerHTML = avatarSVG(project, 64);
  document.getElementById('drawer-title').textContent = project;
  document.getElementById('drawer-stats').innerHTML = '';
  document.getElementById('drawer-inbox').innerHTML = '';
  document.getElementById('drawer-body').innerHTML =
    '<div class="empty">Loading conversation&hellip;</div>';
  document.getElementById('drawer-mask').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  // reset fingerprint to force first render after limit change
  document.getElementById('drawer-body').dataset.fp = '';

  try {
    const [historyR, inboxR] = await Promise.all([
      fetchJSON('/api/dashboard/agent/' + encodeURIComponent(project) + '/history?limit=' + state.currentLimit),
      fetchJSON('/api/dashboard/agent/' + encodeURIComponent(project) + '/inbox'),
    ]);
    renderInbox(project, inboxR.replies);
    renderHistory(project, historyR.tasks);
    updateComposer(historyR.tasks);
  } catch (e) {
    document.getElementById('drawer-body').innerHTML = '<div class="empty">Failed to load: ' + escapeHtml(e.message) + '</div>';
  }
}

function updateComposer(tasks) {
  const target = document.getElementById('composer-target');
  const ta = document.getElementById('composer-text');
  const btn = document.getElementById('composer-send');
  const pending = (tasks || []).find(t => t.status === 'pending');
  if (pending) {
    target.textContent = '↦ ' + pending.task_id;
    target.classList.add('has-task');
    ta.dataset.taskId = pending.task_id;
    ta.disabled = false;
    btn.disabled = false;
    ta.placeholder = 'Reply to AI… (Enter to send, Shift+Enter for newline)';
  } else {
    target.textContent = 'no pending task';
    target.classList.remove('has-task');
    ta.dataset.taskId = '';
    ta.disabled = true;
    btn.disabled = true;
    ta.placeholder = 'No AI is waiting on a card right now.';
  }
}

async function sendComposerReply() {
  const ta = document.getElementById('composer-text');
  const btn = document.getElementById('composer-send');
  const taskId = ta.dataset.taskId;
  const text = ta.value.trim();
  if (!taskId) { showToast('No pending task. Open a card from a feishu workspace first.'); return; }
  if (!text) { showToast('Empty message rejected.'); return; }
  btn.disabled = true;
  ta.disabled = true;
  try {
    const r = await fetchJSON('/api/dashboard/reply/' + taskId, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    ta.value = '';
    autoResizeComposer();
    showToast(r.delivered ? 'Delivered to live waiter.' : (r.mirrored ? 'Queued to pending_replies.' : 'Persisted.'));
    refresh();
    // 重新拉一次 history，让 composer 状态更新（pending → replied）
    if (state.currentProject) {
      const fresh = await fetchJSON('/api/dashboard/agent/' + encodeURIComponent(state.currentProject) + '/history?limit=' + state.currentLimit);
      document.getElementById('drawer-body').dataset.fp = '';
      renderHistory(state.currentProject, fresh.tasks);
      updateComposer(fresh.tasks);
    }
  } catch (e) {
    showToast('Send failed: ' + e.message);
    ta.disabled = false;
    btn.disabled = false;
  }
}

function autoResizeComposer() {
  const ta = document.getElementById('composer-text');
  // 只在用户没手动拖过（保证用户拖大之后不会被 autoResize 踩回去）才自动调高
  if (ta.dataset.manualResized === '1') return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 360) + 'px';
}

// 检测手动拖拽：一旦用户拖了右下角手柄，锁住手动高度不再被自动调整
function watchComposerManualResize() {
  const ta = document.getElementById('composer-text');
  if (!ta || ta.dataset.resizeObserverAttached === '1') return;
  ta.dataset.resizeObserverAttached = '1';
  let lastH = ta.offsetHeight;
  new ResizeObserver(() => {
    const h = ta.offsetHeight;
    if (Math.abs(h - lastH) > 2 && document.activeElement !== ta) {
      // 仅在未 focus 时的外部变化忽略；focus 下的变化是用户拖
    } else if (Math.abs(h - lastH) > 2) {
      ta.dataset.manualResized = '1';
    }
    lastH = h;
  }).observe(ta);
}

async function loadMoreHistory() {
  if (!state.currentProject) return;
  state.currentLimit += HISTORY_PAGE_STEP;
  try {
    const r = await fetchJSON('/api/dashboard/agent/' + encodeURIComponent(state.currentProject) + '/history?limit=' + state.currentLimit);
    // force re-render
    document.getElementById('drawer-body').dataset.fp = '';
    renderHistory(state.currentProject, r.tasks);
    updateComposer(r.tasks);
  } catch (e) {
    showToast('Load more failed: ' + e.message);
  }
}

function renderInbox(project, replies) {
  const box = document.getElementById('drawer-inbox');
  if (!replies || !replies.length) { box.innerHTML = ''; return; }
  const items = replies.map(r => {
    return '<div class="inbox-item"><span class="when">' + fmtTime(r.received_at) + ' &middot; ' + fmtRelative(r.received_at) + (r.parent_task_id ? ' &middot; for ' + escapeHtml(r.parent_task_id) : '') + '</span>' + escapeHtml(r.text) + '</div>';
  }).join('');
  box.innerHTML =
    '<div class="inbox-banner">' +
      '<h4>' + replies.length + ' message' + (replies.length === 1 ? '' : 's') + ' waiting for AI to wake up</h4>' +
      '<div class="desc">These replies arrived while no AI session was attached. They will be delivered the next time this companion calls <code>feishu-resume</code> (typically when you open VS Code in that workspace).</div>' +
      '<div class="inbox-list">' + items + '</div>' +
    '</div>';
}
function closeDrawer() {
  state.currentProject = null;
  document.getElementById('drawer-mask').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
  const ta = document.getElementById('composer-text');
  ta.value = '';
  ta.dataset.taskId = '';
  ta.dataset.manualResized = '';
  ta.disabled = true;
  ta.style.height = '';
  document.getElementById('composer-send').disabled = true;
  document.getElementById('composer-target').textContent = 'no pending task';
  document.getElementById('composer-target').classList.remove('has-task');
}

function renderHistory(project, tasks) {
  const agent = state.agents.find(a => a.project_name === project);
  if (agent) {
    document.getElementById('drawer-stats').innerHTML =
      '<span><strong>' + agent.total + '</strong> turns</span>' +
      '<span><strong>' + agent.pending + '</strong> pending</span>' +
      '<span><strong>' + agent.replied + '</strong> replied</span>' +
      '<span>since <strong>' + fmtTime(agent.first_seen) + '</strong></span>';
  }
  const body = document.getElementById('drawer-body');
  if (!tasks.length) {
    body.innerHTML = '<div class="empty">No transcript yet.</div>';
    return;
  }
  const ordered = [...tasks].reverse();
  // 用最新 task_id 列表做 fingerprint，避免不必要的重渲染
  const fp = ordered.map(t => t.task_id + ':' + t.status + ':' + (t.reply_at || 0)).join('|');
  if (body.dataset.fp === fp) return;
  body.dataset.fp = fp;
  // 顶部：如果返回条数 == 当前 limit，说明可能还有更早的 → 显示加载按钮
  const hasMore = tasks.length >= (state.currentLimit || HISTORY_INITIAL_LIMIT);
  const loadMoreBtn = hasMore
    ? '<div class="load-more-row"><button class="load-more-btn" onclick="loadMoreHistory()">加载更早的 ' + HISTORY_PAGE_STEP + ' 条</button></div>'
    : '';
  body.innerHTML = loadMoreBtn + ordered.map(t => {
    const replyBubble = t.reply_text
      ? '<div class="bubble user"><div class="who">You · ' + fmtTime(t.reply_at) + ' · ' + fmtDuration(t.created_at, t.reply_at) + '</div><div class="md">' + renderMarkdown(t.reply_text) + '</div></div>'
      : '';
    const cancelBtn = (t.status === 'pending')
      ? '<button class="bubble-cancel" onclick="event.stopPropagation(); cancelTask(\\'' + t.task_id + '\\')" title="Cancel this pending task">Cancel</button>'
      : '';
    return '<div class="turn">' +
      '<div class="turn-meta">' +
        '<span>' + fmtTime(t.created_at) + '</span>' +
        '<span class="level ' + escapeHtml(t.level) + '">' + escapeHtml(t.level) + '</span>' +
        '<span class="status-' + escapeHtml(t.status) + '">' + escapeHtml(t.status) + '</span>' +
        '<span style="color:var(--ink-faint);font-family:var(--mono)">' + escapeHtml(t.task_id) + '</span>' +
      '</div>' +
      '<div class="bubble ai">' + cancelBtn + '<div class="who">Companion</div><div class="md">' + renderMarkdown(t.message) + '</div></div>' +
      replyBubble +
    '</div>';
  }).join('');
  setTimeout(() => { const d = document.getElementById('drawer-scroll'); if (d) d.scrollTop = d.scrollHeight; }, 50);
}

async function refresh() {
  try {
    await loadAgents();
    document.getElementById('lastUpdate').textContent = 'updated ' + new Date().toLocaleTimeString('en-GB');
    loadCharts(); // fire-and-forget
    if (state.currentProject) {
      state.preview.clear();
      const lim = state.currentLimit || HISTORY_INITIAL_LIMIT;
      const [historyR, inboxR] = await Promise.all([
        fetchJSON('/api/dashboard/agent/' + encodeURIComponent(state.currentProject) + '/history?limit=' + lim),
        fetchJSON('/api/dashboard/agent/' + encodeURIComponent(state.currentProject) + '/inbox'),
      ]);
      renderInbox(state.currentProject, inboxR.replies);
      renderHistory(state.currentProject, historyR.tasks);
    }
  } catch (e) {
    showToast('Refresh failed: ' + e.message);
  }
}

// ── Charts ───────────────────────────────────────────────
async function loadCharts() {
  try {
    const r = await fetchJSON('/api/dashboard/charts');
    document.getElementById('charts-updated').textContent = 'snapshot ' + new Date(r.generated_at).toLocaleTimeString('en-GB');
    renderHourly(r.hourly_24h || []);
    renderDaily(r.daily_14d || []);
    renderStatusDonut(r.status_distribution || []);
  } catch (e) {
    // 失败就让上一次的图留着，不弹错以免太吵
    console.warn('loadCharts failed:', e);
  }
}

// 通用：返回 SVG 字符串包装器（viewBox 标准化到 0 0 w h）
function svgFrame(w, h, inner) {
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
}

function renderHourly(buckets) {
  const el = document.getElementById('chart-hourly');
  if (!el) return;
  const W = 600, H = 180, padL = 28, padR = 8, padT = 8, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = buckets.length;
  if (!n) { el.innerHTML = '<div class="empty">No data</div>'; return; }
  const max = Math.max(1, ...buckets.map(b => Math.max(b.created, b.replied)));
  // 每个 hour 一组双柱
  const groupW = plotW / n;
  const barW = Math.max(2, groupW * 0.36);
  let bars = '';
  buckets.forEach((b, i) => {
    const x = padL + i * groupW + groupW * 0.5;
    const hC = (b.created / max) * plotH;
    const hR = (b.replied / max) * plotH;
    bars += '<rect class="bar created" x="' + (x - barW - 1) + '" y="' + (padT + plotH - hC) + '" width="' + barW + '" height="' + hC + '"><title>' + fmtHour(b.ts) + ': ' + b.created + ' sent</title></rect>';
    bars += '<rect class="bar replied" x="' + (x + 1) + '" y="' + (padT + plotH - hR) + '" width="' + barW + '" height="' + hR + '"><title>' + fmtHour(b.ts) + ': ' + b.replied + ' replied</title></rect>';
  });
  // x 轴 tick：6 个（每 4h 一个）
  let ticks = '';
  for (let i = 0; i < n; i += 4) {
    const x = padL + i * groupW + groupW * 0.5;
    ticks += '<text class="axis-label" x="' + x + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtHour(buckets[i].ts) + '</text>';
  }
  // y 轴 max
  const yMax = '<text class="axis-label" x="' + (padL - 4) + '" y="' + (padT + 8) + '" text-anchor="end">' + max + '</text>';
  const yZero = '<text class="axis-label" x="' + (padL - 4) + '" y="' + (padT + plotH) + '" text-anchor="end">0</text>';
  const baseline = '<line class="axis-tick" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" />';
  el.innerHTML = svgFrame(W, H, ticks + baseline + bars + yMax + yZero);
}

function renderDaily(buckets) {
  const el = document.getElementById('chart-daily');
  if (!el) return;
  const W = 600, H = 180, padL = 28, padR = 8, padT = 12, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = buckets.length;
  if (!n) { el.innerHTML = '<div class="empty">No data</div>'; return; }
  const max = Math.max(1, ...buckets.map(b => Math.max(b.created, b.replied)));
  const xs = i => padL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const ys = v => padT + plotH - (v / max) * plotH;
  let pathC = '', pathR = '', dots = '';
  buckets.forEach((b, i) => {
    const x = xs(i);
    const yC = ys(b.created), yR = ys(b.replied);
    pathC += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yC.toFixed(1) + ' ';
    pathR += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yR.toFixed(1) + ' ';
    dots += '<circle class="dot created" cx="' + x + '" cy="' + yC + '" r="2.5"><title>' + fmtDay(b.ts) + ': ' + b.created + ' sent</title></circle>';
    dots += '<circle class="dot replied" cx="' + x + '" cy="' + yR + '" r="2.5"><title>' + fmtDay(b.ts) + ': ' + b.replied + ' replied</title></circle>';
  });
  // x 轴：均匀 4 个 tick（第 0/4/8/13）
  let ticks = '';
  const tickAt = [0, Math.floor(n / 3), Math.floor((n * 2) / 3), n - 1];
  tickAt.forEach(i => {
    const x = xs(i);
    ticks += '<text class="axis-label" x="' + x + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtDay(buckets[i].ts) + '</text>';
  });
  const yMax = '<text class="axis-label" x="' + (padL - 4) + '" y="' + (padT + 8) + '" text-anchor="end">' + max + '</text>';
  const yZero = '<text class="axis-label" x="' + (padL - 4) + '" y="' + (padT + plotH) + '" text-anchor="end">0</text>';
  const baseline = '<line class="axis-tick" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" />';
  el.innerHTML = svgFrame(W, H,
    ticks + baseline +
    '<path class="line created" d="' + pathC + '" />' +
    '<path class="line replied" d="' + pathR + '" />' +
    dots + yMax + yZero
  );
}

function renderStatusDonut(rows) {
  const el = document.getElementById('chart-status');
  if (!el) return;
  const W = 220, H = 180;
  const total = rows.reduce((s, r) => s + Number(r.n || 0), 0);
  if (!total) { el.innerHTML = '<div class="empty">No data</div>'; return; }
  const cx = 70, cy = 90, rOuter = 60, rInner = 38;
  const colorMap = {
    pending: '#c08a2b',
    replied: '#5b9e8a',
    expired: 'rgba(31,26,20,0.32)',
    cancelled: 'rgba(31,26,20,0.18)',
  };
  // 排序：replied → pending → cancelled → expired（让主要色块占大头）
  const order = ['replied', 'pending', 'cancelled', 'expired'];
  const sorted = order
    .map(k => rows.find(r => r.status === k))
    .filter(Boolean)
    .concat(rows.filter(r => !order.includes(r.status)));
  let cur = -Math.PI / 2; // start at 12 o'clock
  let arcs = '';
  let legend = '';
  sorted.forEach((r, i) => {
    const frac = Number(r.n) / total;
    if (frac <= 0) return;
    const end = cur + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + Math.cos(cur) * rOuter, y1 = cy + Math.sin(cur) * rOuter;
    const x2 = cx + Math.cos(end) * rOuter, y2 = cy + Math.sin(end) * rOuter;
    const x3 = cx + Math.cos(end) * rInner, y3 = cy + Math.sin(end) * rInner;
    const x4 = cx + Math.cos(cur) * rInner, y4 = cy + Math.sin(cur) * rInner;
    const fill = colorMap[r.status] || '#999';
    arcs += '<path d="M' + x1 + ',' + y1 + ' A' + rOuter + ',' + rOuter + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' L' + x3 + ',' + y3 + ' A' + rInner + ',' + rInner + ' 0 ' + large + ' 0 ' + x4 + ',' + y4 + ' Z" fill="' + fill + '"><title>' + r.status + ': ' + r.n + ' (' + (frac * 100).toFixed(1) + '%)</title></path>';
    legend += '<g transform="translate(150, ' + (40 + i * 22) + ')">' +
      '<rect x="0" y="-9" width="10" height="10" fill="' + fill + '" />' +
      '<text class="donut-key" x="16" y="0">' + escapeHtml(r.status) + ' &middot; ' + r.n + '</text>' +
      '</g>';
    cur = end;
  });
  const center =
    '<text class="donut-value" x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle">' + total + '</text>' +
    '<text class="donut-label" x="' + cx + '" y="' + (cy + 22) + '" text-anchor="middle">TOTAL</text>';
  el.innerHTML = svgFrame(W, H, arcs + legend + center);
}

function fmtHour(ms) {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  return h + ':00';
}
function fmtDay(ms) {
  const d = new Date(ms);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

// ── Modal ────────────────────────────────────────────────
function openReply(taskId) {
  document.getElementById('reply-task-id').textContent = taskId;
  document.getElementById('reply-text').value = '';
  document.getElementById('reply-modal').classList.add('open');
  setTimeout(() => document.getElementById('reply-text').focus(), 60);
  if (typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation();
}
// 点 featured 卡上的气泡 → 找该项目最新一条 pending task 直接开 reply
async function openReplyByProject(encodedName) {
  const project = decodeURIComponent(encodedName);
  try {
    const r = await fetchJSON('/api/dashboard/agent/' + encodeURIComponent(project) + '/history?limit=20');
    const pending = (r.tasks || []).find(t => t.status === 'pending');
    if (pending) {
      openReply(pending.task_id);
    } else {
      // 没有 pending → 当成"打开会话查看"
      openDrawer(encodedName);
    }
  } catch (e) {
    showToast('Cannot open quick reply: ' + e.message);
  }
}
function closeModal() { document.getElementById('reply-modal').classList.remove('open'); }
async function submitReply() {
  const taskId = document.getElementById('reply-task-id').textContent;
  const text = document.getElementById('reply-text').value.trim();
  if (!text) { showToast('Empty message rejected.'); return; }
  try {
    const r = await fetchJSON('/api/dashboard/reply/' + taskId, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    closeModal();
    showToast(r.delivered ? 'Delivered to live waiter.' : (r.mirrored ? 'Queued to pending_replies.' : 'Persisted.'));
    refresh();
  } catch (e) { showToast('Send failed: ' + e.message); }
}
async function cancelTask(taskId) {
  if (!confirm('Cancel task ' + taskId + ' ?\\n\\nWaiting AI will receive [DASHBOARD_CANCELLED].')) return;
  try {
    await fetchJSON('/api/dashboard/cancel/' + taskId, { method: 'POST' });
    showToast('Task cancelled.');
    refresh();
  } catch (e) { showToast('Cancel failed: ' + e.message); }
  if (typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation();
}

document.getElementById('agent-filter').addEventListener('input', (e) => {
  state.filter = e.target.value;
  document.getElementById('residents-grid').dataset.fp = '';
  renderResidents();
});
document.getElementById('sort-by').addEventListener('change', (e) => {
  state.sortBy = e.target.value;
  document.getElementById('residents-grid').dataset.fp = '';
  renderResidents();
});
document.getElementById('reply-modal').addEventListener('click', (e) => { if (e.target.id === 'reply-modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeDrawer(); } });

// composer：Enter 发送，Shift+Enter 换行；输入时自动调整高度
const composerTextEl = document.getElementById('composer-text');
composerTextEl.addEventListener('input', autoResizeComposer);
composerTextEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!document.getElementById('composer-send').disabled) sendComposerReply();
  }
});
watchComposerManualResize();

let timer = null;
function setupAutoRefresh() {
  if (timer) { clearInterval(timer); timer = null; }
  if (document.getElementById('auto-refresh').checked) timer = setInterval(refresh, 5000);
}
document.getElementById('auto-refresh').addEventListener('change', setupAutoRefresh);

refresh();
setupAutoRefresh();
</script>
</body>
</html>`;
