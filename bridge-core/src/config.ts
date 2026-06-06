import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 仓库根 = bridge-core/dist/ 上面两层 / 或 bridge-core/src/ 上面两层（dev 模式 tsx）
const REPO_ROOT = path.resolve(__dirname, "../..");

// ============================================================
// 配置加载顺序（v0.0.44+ JSON 优先，向后兼容 .env）
//   1. 读 copilot-bridge.config.json（仓库根）—— 主配置
//   2. 字段值若为 "${env:XXX}" 模板 → 从环境变量读
//   3. 字段缺失或 JSON 不存在 → 回退 .env 老格式（兼容老用户）
// ============================================================

// 先加载 .env（无论 JSON 是否存在，都允许 .env 注入 secret 字段）
dotenv.config({ path: path.resolve(REPO_ROOT, ".env") });

type RawConfig = {
    feishu?: {
        appId?: string;
        appSecret?: string;
        targetChatId?: string;
        encryptKey?: string;
        verificationToken?: string;
    };
    server?: {
        port?: number;
        host?: string;
    };
    publicEndpoint?: {
        mode?: "temp-tunnel" | "named-tunnel" | "manual";
        domain?: string;
        tunnelName?: string;
    };
    paths?: {
        dbFile?: string;
        imageInboundDir?: string;
    };
    behavior?: {
        waitPollIntervalMs?: number;
        maxRetries?: number;
    };
};

function loadJsonConfig(): RawConfig {
    const jsonPath = path.resolve(REPO_ROOT, "copilot-bridge.config.json");
    if (!fs.existsSync(jsonPath)) {
        return {};
    }
    try {
        const raw = fs.readFileSync(jsonPath, "utf-8");
        // 容忍 // 注释（JSONC）
        const stripped = raw
            .replace(/^\s*\/\/.*$/gm, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
        return JSON.parse(stripped) as RawConfig;
    } catch (e) {
        console.error(
            `[config] WARN: copilot-bridge.config.json 解析失败: ${(e as Error).message}`
        );
        return {};
    }
}

function resolveEnvTemplate(value: string | undefined): string | undefined {
    if (!value) return value;
    // "${env:XXX}" → process.env.XXX
    const m = value.match(/^\$\{env:([A-Z0-9_]+)\}$/);
    if (m) {
        return process.env[m[1]];
    }
    return value;
}

function pickString(jsonVal: string | undefined, envName: string): string {
    const resolved = resolveEnvTemplate(jsonVal);
    if (resolved && resolved.trim() !== "") return resolved.trim();
    const envVal = process.env[envName];
    if (envVal && envVal.trim() !== "") return envVal.trim();
    return "";
}

function requiredField(name: string, value: string): string {
    if (
        !value ||
        value.includes("xxxxxxxx") ||
        value.startsWith("cli_xxx") ||
        value.startsWith("oc_xxx")
    ) {
        if (process.env.FEISHU_MOCK === "1") return `mock_${name.toLowerCase()}`;
        console.error(
            `[config] FATAL: 必填字段 ${name} 未配置或仍是占位符。请检查 copilot-bridge.config.json 或 .env`
        );
        process.exit(1);
    }
    return value;
}

const raw = loadJsonConfig();

const feishuAppId = pickString(raw.feishu?.appId, "FEISHU_APP_ID");
const feishuAppSecret = pickString(raw.feishu?.appSecret, "FEISHU_APP_SECRET");
const feishuTargetChatId = pickString(raw.feishu?.targetChatId, "FEISHU_TARGET_CHAT_ID");
const feishuEncryptKey = pickString(raw.feishu?.encryptKey, "FEISHU_ENCRYPT_KEY");
const feishuVerificationToken = pickString(
    raw.feishu?.verificationToken,
    "FEISHU_VERIFICATION_TOKEN"
);

const serverPort =
    raw.server?.port ?? parseInt(process.env.BRIDGE_PORT ?? "3000", 10);
const serverHost = raw.server?.host ?? process.env.BRIDGE_HOST ?? "127.0.0.1";

const dbFile = raw.paths?.dbFile
    ? path.resolve(REPO_ROOT, raw.paths.dbFile)
    : path.resolve(REPO_ROOT, "bridge.db");

const imageInboundDir = raw.paths?.imageInboundDir
    ? path.resolve(REPO_ROOT, raw.paths.imageInboundDir)
    : path.resolve(REPO_ROOT, "images");

export const config = {
    feishu: {
        appId: requiredField("FEISHU_APP_ID", feishuAppId),
        appSecret: requiredField("FEISHU_APP_SECRET", feishuAppSecret),
        targetChatId: feishuTargetChatId,
        encryptKey: feishuEncryptKey,
        verificationToken: feishuVerificationToken,
    },
    bridge: {
        port: serverPort,
        host: serverHost,
    },
    publicEndpoint: {
        mode: raw.publicEndpoint?.mode ?? "temp-tunnel",
        domain: raw.publicEndpoint?.domain ?? "",
        tunnelName: raw.publicEndpoint?.tunnelName ?? "",
    },
    behavior: {
        waitPollIntervalMs: raw.behavior?.waitPollIntervalMs ?? 1500,
        maxRetries: raw.behavior?.maxRetries ?? 3,
    },
    mock: process.env.FEISHU_MOCK === "1",
    paths: {
        db: dbFile,
        images: imageInboundDir,
    },
};

export function maskSecret(s: string): string {
    if (!s) return "";
    if (s.length <= 8) return "****";
    return s.slice(0, 4) + "..." + "****";
}

if (config.feishu.encryptKey) {
    console.error(
        "[config] FATAL: FEISHU_ENCRYPT_KEY 不为空。本项目不支持加密回调，请到飞书后台『事件与回调 → 加密策略』把 Encrypt Key 清空。"
    );
    process.exit(1);
}

if (!config.feishu.targetChatId && !config.mock) {
    console.error(
        "[config] WARN: targetChatId 未配置。webhook/health 仍可用，但 sendCard 会失败。请跑 pnpm --filter bridge-core get-chat-id"
    );
}

export function logConfigSafe() {
    console.error(
        `[config] feishu app_id=${maskSecret(config.feishu.appId)} secret=${maskSecret(
            config.feishu.appSecret
        )} chat=${maskSecret(config.feishu.targetChatId)} port=${config.bridge.port} db=${config.paths.db}`
    );
}
