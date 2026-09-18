import crypto from "node:crypto";

/**
 * 精简 HS256 JWT（无第三方依赖）
 */
function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64url");
}

export function signJwt(payload, secret, expiresInSec = 8 * 60 * 60) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest("base64url");
  return `${h}.${p}.${sig}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("invalid token");
  const [h, p, sig] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("invalid signature");
  }
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp != null && now >= payload.exp) {
    throw new Error("token expired");
  }
  return payload;
}

/**
 * 调用 SAP MCP_LOGIN（ICF Basic Auth 验密）
 */
export async function sapMcpLogin(username, password, loginUrl) {
  const basic = Buffer.from(`${username}:${password}`, "utf8").toString(
    "base64"
  );

  const res = await fetch(loginUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  });

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: 401,
      message: "登录失败，账号或密码错误",
    };
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: 502,
      message: `SAP 返回非 JSON：${text.slice(0, 200)}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: 502,
      message: data.message || `SAP HTTP ${res.status}`,
    };
  }

  if (String(data.type).toUpperCase() !== "S") {
    return {
      ok: false,
      status: 403,
      message: data.message || "缺少 MCP 工具权限，请联系管理员",
    };
  }

  const tools = Array.isArray(data.tools) ? data.tools : [];
  return {
    ok: true,
    data: {
      user_id: data.user_id || username,
      user_name: data.user_name || "",
      tools,
      message: data.message || "MCP登录认证成功",
    },
  };
}

/** 规范化 SAP tools 列表为 { tool, tool_text }[] */
export function normalizeSapTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((item) => {
      if (item == null) return null;
      if (typeof item === "string") {
        return { tool: item.toUpperCase(), tool_text: item };
      }
      const tool = String(item.tool || "").toUpperCase();
      if (!tool) return null;
      return {
        tool,
        tool_text: item.tool_text || tool,
      };
    })
    .filter(Boolean);
}

/**
 * 按 SAP ZTOOL 过滤本地 AI tool key
 * @param {string[]} allToolKeys e.g. ['get_profit','sap_profit_schema']
 * @param {{tool:string}[]} sapTools
 */
export function filterToolKeys(allToolKeys, sapTools) {
  const normalized = normalizeSapTools(sapTools);
  if (normalized.some((t) => t.tool === "*")) {
    return [...allToolKeys];
  }
  const allowed = new Set(normalized.map((t) => t.tool));
  return allToolKeys.filter((key) => allowed.has(String(key).toUpperCase()));
}
