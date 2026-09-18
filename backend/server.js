import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import cors from "cors";
import { generateText, tool, stepCountIs } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { z } from "zod";
import { marked } from "marked";
import {
  filterToolKeys,
  normalizeSapTools,
  sapMcpLogin,
  signJwt,
  verifyJwt,
} from "./auth.js";
import { consumeCaptcha, createCaptcha } from "./captcha.js";

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const MCP_BASE =
  process.env.MCP_BASE || "http://192.168.1.177/mcp-sap-bak/mcp";
const MCP_TOKEN = process.env.MCP_TOKEN || "";
const SAP_LOGIN_URL =
  process.env.SAP_LOGIN_URL ||
  "http://192.168.1.164:8020/zbak_inf?ACTION=MCP_LOGIN";
const JWT_SECRET =
  process.env.JWT_SECRET || "dev-only-change-me-ai-chat-jwt-secret";
const JWT_EXPIRES_SEC = Number(process.env.JWT_EXPIRES_SEC || 8 * 60 * 60);

// ── MCP SSE 调用 ────────────────────────────────────
async function mcpCall(toolName, args = {}) {
  const res = await fetch(MCP_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: Date.now(),
    }),
  });
  const raw = await res.text();
  for (const line of raw.split("\n")) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      const text = data.result?.content?.[0]?.text;
      return text || JSON.stringify(data.result);
    }
  }
  return raw;
}

// ── 工具定义（完整目录；运行时按用户 ZTOOL 过滤）──
const allSapTools = {
  get_profit: tool({
    description:
      "查询SAP运营指标财务专家分析数据(收入、成本、毛利率、净利润、资产负债率等)。period_type: M=月度 Q=季度 Y=年度",
    inputSchema: z.object({
      bukrs: z.string().describe("公司代码，如 1100"),
      period_type: z.enum(["M", "Q", "Y"]).describe("期间类型"),
      gjahr: z.string().describe("会计年度，如 2025"),
      monat: z
        .number()
        .min(1)
        .max(12)
        .optional()
        .describe("月，period_type=M时必填"),
      quarter: z
        .number()
        .min(1)
        .max(4)
        .optional()
        .describe("季度，period_type=Q时必填"),
    }),
    execute: async (args) => mcpCall("get_profit", args),
  }),
  sap_profit_schema: tool({
    description: "返回运营指标字段中文说明，解读get_profit结果前应先调用",
    inputSchema: z.object({}),
    execute: async () => mcpCall("sap_profit_schema", {}),
  }),
};

function toolsForUser(sapTools) {
  const keys = filterToolKeys(Object.keys(allSapTools), sapTools);
  /** @type {Record<string, typeof allSapTools[keyof typeof allSapTools]>} */
  const picked = {};
  for (const key of keys) {
    picked[key] = allSapTools[key];
  }
  return picked;
}

// ── Express ─────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── 请求日志（不打印 Authorization / 密码）──────────
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.url}`);
  next();
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "登录失败，账号或密码错误" });
  }
  try {
    const payload = verifyJwt(match[1], JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.sub,
      name: payload.name || "",
      tools: normalizeSapTools(payload.tools),
    };
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

// ── 认证：验证码 + SAP MCP_LOGIN ──────────────────────
app.get("/api/auth/captcha", (req, res) => {
  const captcha = createCaptcha();
  res.json(captcha);
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const captchaId = String(req.body?.captchaId || "").trim();
  const captchaCode = String(req.body?.captchaCode || "").trim();

  if (!username || !password) {
    return res.status(400).json({ error: "用户名和密码必填" });
  }

  const captchaResult = consumeCaptcha(captchaId, captchaCode);
  if (!captchaResult.ok) {
    return res.status(400).json({ error: captchaResult.message });
  }

  try {
    const result = await sapMcpLogin(username, password, SAP_LOGIN_URL);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.message });
    }

    const tools = normalizeSapTools(result.data.tools);
    if (tools.length === 0) {
      return res.status(403).json({
        error: result.data.message || "缺少 MCP 工具权限，请联系管理员",
      });
    }

    const token = signJwt(
      {
        sub: result.data.user_id,
        name: result.data.user_name,
        tools,
      },
      JWT_SECRET,
      JWT_EXPIRES_SEC
    );

    res.json({
      token,
      user: {
        id: result.data.user_id,
        username: result.data.user_id,
        name: result.data.user_name,
        tools,
      },
    });
  } catch (err) {
    console.error("❌ SAP 登录失败:", err?.message || err);
    res.status(502).json({
      error: err?.message || "无法连接 SAP 登录接口",
    });
  }
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ── 聊天（需登录；按 ZTOOL 过滤工具）────────────────
app.post("/api/chat", authMiddleware, async (req, res) => {
  console.log(
    "📩 收到请求:",
    req.user?.username,
    req.body?.message?.slice(0, 100)
  );
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const userTools = toolsForUser(req.user.tools);
  if (Object.keys(userTools).length === 0) {
    return res.status(403).json({ error: "当前账号无可用 MCP 工具权限" });
  }

  try {
    console.log(
      "🤖 调用 AI... tools:",
      Object.keys(userTools).join(", ") || "(none)"
    );
    const collectedSteps = [];

    const result = await generateText({
      model: deepseek("deepseek-chat"),
      tools: userTools,
      stopWhen: stepCountIs(10),
      messages: [{ role: "user", content: message }],
      onStepFinish: (step) => {
        console.log(
          "  📋 Step:",
          step.finishReason,
          step.toolCalls?.length || 0,
          "tool calls"
        );
        collectedSteps.push({
          finishReason: step.finishReason,
          text: step.text?.slice(0, 200) || "",
          toolCalls: (step.toolCalls || []).map((tc) => ({
            toolName: tc.toolName,
            input: tc.input || tc.args || {},
          })),
          toolResults: (step.toolResults || []).map((tr) => ({
            toolName: tr.toolName,
            output: JSON.stringify(tr.output || tr.result || "").slice(0, 500),
          })),
        });
      },
    });

    console.log(
      "✅ AI 响应成功, text长度:",
      result.text?.length,
      "steps:",
      collectedSteps.length
    );

    const html = marked.parse(result.text, { breaks: true, gfm: true });

    res.json({
      html,
      steps: collectedSteps,
      providerMetadata: result.providerMetadata,
    });
  } catch (err) {
    console.error("❌ AI 调用失败:", err?.message || err);
    console.error(
      "❌ 完整错误:",
      JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
    );
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ── 健康检查 ─────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 全局错误处理 ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ 未捕获错误:", err?.message || err);
  console.error("❌ 堆栈:", err?.stack);
  res.status(500).json({ error: err?.message || "服务器内部错误" });
});

// ── 启动 ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 服务已启动: http://localhost:${PORT}`);
  console.log(`🔐 SAP 登录: ${SAP_LOGIN_URL}`);
});
