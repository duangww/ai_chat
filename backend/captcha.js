import crypto from "node:crypto";

/** @type {Map<string, { code: string, exp: number }>} */
const store = new Map();

const TTL_MS = 5 * 60 * 1000;
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混字符

function cleanup() {
  const now = Date.now();
  for (const [id, row] of store) {
    if (row.exp <= now) store.delete(id);
  }
}

function randomCode(len = 4) {
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 生成带干扰线的 SVG 验证码 */
function renderSvg(code) {
  const w = 120;
  const h = 40;
  const chars = [...code];
  const letters = chars
    .map((ch, i) => {
      const x = 18 + i * 26;
      const y = 26 + (i % 2 === 0 ? -2 : 2);
      const rot = (i % 2 === 0 ? -12 : 10) + (i - 1) * 3;
      const color = `hsl(${(i * 70 + 200) % 360} 55% 35%)`;
      return `<text x="${x}" y="${y}" fill="${color}" font-size="22" font-family="Arial,sans-serif" font-weight="700" transform="rotate(${rot} ${x} ${y})">${escapeXml(ch)}</text>`;
    })
    .join("");

  const lines = Array.from({ length: 4 }, (_, i) => {
    const x1 = crypto.randomInt(0, w);
    const y1 = crypto.randomInt(0, h);
    const x2 = crypto.randomInt(0, w);
    const y2 = crypto.randomInt(0, h);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="hsl(${i * 40} 40% 70%)" stroke-width="1"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  ${lines}
  ${letters}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function createCaptcha() {
  cleanup();
  const id = crypto.randomUUID();
  const code = randomCode(4);
  store.set(id, { code, exp: Date.now() + TTL_MS });
  return {
    captchaId: id,
    image: renderSvg(code),
  };
}

/**
 * 校验并消费验证码（一次性）
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function consumeCaptcha(captchaId, captchaCode) {
  cleanup();
  const id = String(captchaId || "").trim();
  const input = String(captchaCode || "").trim().toUpperCase();

  if (!id || !input) {
    return { ok: false, message: "请输入验证码" };
  }

  const row = store.get(id);
  store.delete(id);

  if (!row || row.exp <= Date.now()) {
    return { ok: false, message: "验证码已过期，请刷新后重试" };
  }

  if (row.code !== input) {
    return { ok: false, message: "验证码错误" };
  }

  return { ok: true };
}
