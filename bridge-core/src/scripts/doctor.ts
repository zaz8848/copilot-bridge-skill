/**
 * 自检命令：跑 .\scripts\doctor.ps1（PowerShell wrapper）或直接 node bridge-core/dist/scripts/doctor.js
 * 检查所有依赖、文件、端口、配置是否齐全。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

let pass = 0;
let fail = 0;
let warn = 0;

function ok(s: string) { console.log(`✅ ${s}`); pass++; }
function bad(s: string) { console.log(`❌ ${s}`); fail++; }
function warning(s: string) { console.log(`⚠️  ${s}`); warn++; }

console.log(`Copilot Bridge Doctor — repo: ${repoRoot}\n`);

// ---- Node ----
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} 太老，需要 >= 20`);

// ---- 关键文件 ----
const files = [
    ".env.example",
    "package.json",
    "pnpm-workspace.yaml",
    "bridge-core/dist/index.js",
    "mcp-server/dist/index.js",
    ".vscode/mcp.json",
    "scripts/start.ps1",
];
for (const f of files) {
    if (existsSync(path.join(repoRoot, f))) ok(`存在 ${f}`);
    else bad(`缺失 ${f}`);
}

// ---- .env ----
const envPath = path.join(repoRoot, ".env");
if (!existsSync(envPath)) {
    warning(`.env 不存在 (mock 模式 OK，跑真飞书前必须有)`);
} else {
    const envText = await import("node:fs").then((fs) => fs.readFileSync(envPath, "utf8"));
    const requiredKeys = ["FEISHU_APP_ID", "FEISHU_APP_SECRET"];
    for (const k of requiredKeys) {
        const re = new RegExp(`^${k}=(.+)$`, "m");
        const m = envText.match(re);
        if (!m) bad(`.env 缺 ${k}`);
        else if (m[1].includes("xxxxxxxx") || m[1].trim() === "") bad(`.env ${k} 仍是占位符`);
        else ok(`.env ${k} 已填`);
    }
    // chat_id 是软依赖：webhook/health 不需要，sendCard 才需要
    {
        const m = envText.match(/^FEISHU_TARGET_CHAT_ID=(.+)$/m);
        if (!m || m[1].trim() === "") warning(`.env FEISHU_TARGET_CHAT_ID 未填（手机加机器人单聊后跑 get-chat-id）`);
        else ok(`.env FEISHU_TARGET_CHAT_ID 已填`);
    }
    if (/^FEISHU_ENCRYPT_KEY=.+$/m.test(envText)) {
        bad(`.env FEISHU_ENCRYPT_KEY 必须留空（项目不支持加密回调）`);
    } else {
        ok(`.env FEISHU_ENCRYPT_KEY 留空`);
    }
}

// ---- node_modules ----
if (existsSync(path.join(repoRoot, "node_modules/.pnpm"))) ok(`pnpm install 已跑`);
else bad(`没装依赖：pnpm install`);

// ---- better-sqlite3 native ----
const nativeGlob = path.join(
    repoRoot,
    "node_modules/.pnpm"
);
try {
    const fs = await import("node:fs");
    const dirs = fs.readdirSync(nativeGlob).filter((d) => d.startsWith("better-sqlite3@"));
    if (dirs.length === 0) bad(`找不到 better-sqlite3 包`);
    else {
        const nodefile = path.join(nativeGlob, dirs[0], "node_modules/better-sqlite3/build/Release/better_sqlite3.node");
        if (existsSync(nodefile)) ok(`better-sqlite3 native 已编译`);
        else bad(`better-sqlite3 native 未编译。修复：cd node_modules/.pnpm/${dirs[0]}/node_modules/better-sqlite3 ; $env:npm_config_cache="$env:LOCALAPPDATA\\npm-cache" ; npm run install`);
    }
} catch (e: any) {
    warning(`检查 better-sqlite3 native 失败: ${e.message}`);
}

// ---- cloudflared ----
const cfPath = path.join(
    process.env.LOCALAPPDATA ?? "",
    "Microsoft/WinGet/Packages/Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe/cloudflared.exe"
);
if (existsSync(cfPath)) ok(`cloudflared 已装 (winget)`);
else warning(`找不到 cloudflared。装：winget install Cloudflare.cloudflared`);

// ---- 端口 3000 ----
await new Promise<void>((resolve) => {
    const sock = net.createConnection(3000, "127.0.0.1");
    sock.setTimeout(500);
    sock.on("connect", () => {
        warning(`端口 3000 已被占用 (可能 bridge core 正在跑，或别的程序)`);
        sock.destroy();
        resolve();
    });
    sock.on("timeout", () => { ok(`端口 3000 空闲`); sock.destroy(); resolve(); });
    sock.on("error", () => { ok(`端口 3000 空闲`); resolve(); });
});

console.log(`\n汇总: ${pass} 通过 / ${warn} 警告 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
