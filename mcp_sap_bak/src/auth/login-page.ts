export function formatLoginTtl(loginTtlMs: number): string {
  const ms = Number.isFinite(loginTtlMs) && loginTtlMs > 0 ? loginTtlMs : 30 * 24 * 60 * 60 * 1000;
  const minutes = ms / 60_000;
  if (minutes < 60) {
    const n = Math.max(1, Math.round(minutes));
    return `${n} 分钟`;
  }
  const hours = ms / 3_600_000;
  if (hours < 24) {
    const n = Math.abs(hours - Math.round(hours)) < 0.05 ? Math.round(hours) : Number(hours.toFixed(1));
    return `${n} 小时`;
  }
  const days = ms / 86_400_000;
  const n = Math.abs(days - Math.round(days)) < 0.05 ? Math.round(days) : Number(days.toFixed(1));
  return `${n} 天`;
}

export function loginPageHtml(opts: {
  serverName: string;
  mcpUrl: string;
  apiBase?: string;
  pendingId?: string;
  cancelUrl?: string;
  oauthPopup?: boolean;
  loginTtlMs?: number;
}): string {
  const serverName = JSON.stringify(opts.serverName);
  const mcpUrl = JSON.stringify(opts.mcpUrl);
  const apiBase = JSON.stringify((opts.apiBase || "").replace(/\/+$/, ""));
  const pendingInit = JSON.stringify(opts.pendingId || "");
  const cancelUrl = JSON.stringify(opts.cancelUrl || "");
  const oauthPopup = opts.oauthPopup ? "true" : "false";
  const ttlLabel = JSON.stringify(formatLoginTtl(opts.loginTtlMs ?? 0));
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SAP MCP 登录 — 请勿关闭</title>
  <style>
    :root { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #111827; }
    body { margin: 0; min-height: 100vh; background: rgba(15, 23, 42, .55); display: flex; align-items: center; justify-content: center; }
    .modal { width: min(420px, calc(100vw - 32px)); background: #fff; border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); padding: 28px 28px 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .sub { color: #6b7280; font-size: 13px; margin: 0 0 18px; line-height: 1.5; }
    label { display: block; font-size: 13px; color: #4b5563; margin: 12px 0 6px; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 14px; }
    input:focus { outline: 2px solid #93c5fd; border-color: #2563eb; }
    button { border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-size: 14px; }
    .btn { background: #2563eb; color: #fff; width: 100%; margin-top: 16px; }
    .btn.gray { background: #e5e7eb; color: #111827; width: auto; margin-top: 0; }
    .btn.link { background: transparent; color: #6b7280; width: 100%; margin-top: 8px; }
    .err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; }
    .warn { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; padding: 10px 12px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; line-height: 1.55; }
    .ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; word-break: break-all; }
    pre { background: #0f172a; color: #e5e7eb; padding: 12px; border-radius: 10px; font-size: 12px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
    .row { display: flex; gap: 8px; margin-top: 12px; }
    .muted { color: #9ca3af; font-size: 12px; margin-top: 10px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="modal" id="app"></div>
  <script>
    const SERVER_NAME = ${serverName};
    const MCP_URL = ${mcpUrl};
    const API_BASE = ${apiBase};
    const OAUTH_POPUP = ${oauthPopup};
    const TTL_LABEL = ${ttlLabel};
    const CANCEL_URL = ${cancelUrl};
    const STORE_KEY = "mcp_sap_login_" + SERVER_NAME;
    const pending = ${pendingInit} || new URLSearchParams(location.search).get("pending") || "";
    const state = { error: "", loading: false, session: null };
    let leaveOk = false;

    function mcpJson(token) {
      return JSON.stringify({
        mcpServers: {
          [SERVER_NAME]: {
            type: "http",
            url: MCP_URL,
            headers: { Authorization: "Bearer " + token }
          }
        }
      }, null, 2);
    }

    function apiUrl(path) {
      return (API_BASE || "") + "/" + path;
    }

    async function api(path, opts = {}) {
      const res = await fetch(apiUrl(path), {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        ...opts,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }

    function saveLocal(session) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(session)); } catch {}
    }
    function loadLocal() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
    }
    function clearLocal() {
      try { localStorage.removeItem(STORE_KEY); } catch {}
    }

    function goRedirect(url) {
      if (!url) return;
      leaveOk = true;
      location.href = url;
    }

    function cancelAuth() {
      if (CANCEL_URL) {
        goRedirect(CANCEL_URL);
        return;
      }
      leaveOk = true;
      window.close();
    }

    async function continueOAuth() {
      if (!pending) return false;
      const data = await api("api/login/continue", {
        method: "POST",
        body: JSON.stringify({ pending }),
      });
      if (data.redirect) {
        goRedirect(data.redirect);
        return true;
      }
      return false;
    }

    async function continueFromSession() {
      state.loading = true;
      state.error = "";
      render();
      try {
        if (await continueOAuth()) return;
        state.error = "授权已过期，请重新输入账号密码";
      } catch (err) {
        state.error = err.message;
      }
      state.loading = false;
      render();
    }

    async function boot() {
      try {
        const data = await api("api/login/status");
        if (data.ok) {
          state.session = data;
          saveLocal({ sap_username: data.sap_username, token: data.token });
          if (await continueOAuth()) return;
          render();
          return;
        }
      } catch {}
      const local = loadLocal();
      if (local && local.token) {
        try {
          const data = await api("api/login/status", {
            headers: { Authorization: "Bearer " + local.token },
          });
          if (data.ok) {
            state.session = data;
            if (await continueOAuth()) return;
            render();
            return;
          }
        } catch {
          clearLocal();
        }
      }
      render();
    }

    async function login(e) {
      e.preventDefault();
      state.error = "";
      state.loading = true;
      render();
      try {
        const f = e.target;
        const data = await api("api/login", {
          method: "POST",
          body: JSON.stringify({
            username: f.username.value,
            password: f.password.value,
            pending,
          }),
        });
        saveLocal({ sap_username: data.sap_username, token: data.token });
        if (data.redirect) {
          goRedirect(data.redirect);
          return;
        }
        state.session = data;
        state.loading = false;
        render();
      } catch (err) {
        state.error = err.message;
        state.loading = false;
        render();
      }
    }

    async function logout() {
      try { await api("api/logout", { method: "POST" }); } catch {}
      clearLocal();
      state.session = null;
      render();
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        alert("已复制");
      } catch {
        prompt("请手动复制", text);
      }
    }

    function ttlHint(s) {
      if (s && s.expires_at) {
        const exp = new Date(s.expires_at);
        if (!isNaN(exp.getTime())) {
          const text = exp.toLocaleString("zh-CN", { hour12: false });
          return "此 Token 将于 " + text + " 过期（配置约 " + TTL_LABEL + "）。";
        }
      }
      return "有效期约 " + TTL_LABEL + "。";
    }

    function render() {
      const el = document.getElementById("app");
      if (!OAUTH_POPUP && state.session && state.session.token) {
        const s = state.session;
        el.innerHTML = \`
          <h1>已登录</h1>
          <p class="sub">账号 \${s.sap_username}，Token 已记住。WorkBuddy 可只配 URL，或把下面片段写入 mcp.json。</p>
          <div class="ok">Token：<b>\${s.token}</b></div>
          <pre id="cfg"></pre>
          <div class="row">
            <button class="btn gray" type="button" onclick="copyText(document.getElementById('cfg').innerText)">复制 mcp.json</button>
            <button class="btn gray" type="button" onclick="logout()">退出并换账号</button>
          </div>
          <p class="muted">\${ttlHint(s)}过期后再次打开本页输入 SAP 账号密码即可。</p>\`;
        document.getElementById("cfg").textContent = mcpJson(s.token);
        return;
      }
      if (OAUTH_POPUP && state.session && state.session.sap_username && pending) {
        const s = state.session;
        el.innerHTML = \`
          <h1>继续授权</h1>
          <div class="warn"><b>请不要关闭此窗口。</b></div>
          <p class="sub">当前浏览器已登录 SAP 账号 <b>\${s.sap_username}</b>。点击继续即可返回 WorkBuddy，无需再输密码。</p>
          \${state.error ? '<div class="err">'+state.error+'</div>' : ''}
          <button class="btn" type="button" onclick="continueFromSession()" \${state.loading ? 'disabled' : ''}>\${state.loading ? '正在返回…' : '继续授权并返回 WorkBuddy'}</button>
          <button class="btn link" type="button" onclick="logout()">换一个账号登录</button>
          <button class="btn link" type="button" onclick="cancelAuth()">取消授权</button>\`;
        return;
      }
      el.innerHTML = \`
        <h1>SAP 账号登录</h1>
        \${OAUTH_POPUP ? '<div class="warn"><b>请不要关闭此窗口。</b>登录完成前关掉，WorkBuddy 会停在「授权中」。若已关掉，请回到 WorkBuddy 关闭再打开开关，或点刷新重新连接。</div>' : ''}
        <p class="sub">输入你的 SAP 账号和密码。登录成功后 WorkBuddy 会记住，下次不用再输。</p>
        \${state.error ? '<div class="err">'+state.error+'</div>' : ''}
        <form onsubmit="login(event)">
          <label>SAP 账号</label>
          <input name="username" autocomplete="username" required placeholder="请输入 SAP 账号" \${state.loading ? 'disabled' : ''} />
          <label>SAP 密码</label>
          <input name="password" type="password" autocomplete="current-password" required \${state.loading ? 'disabled' : ''} />
          <button class="btn" type="submit" \${state.loading ? 'disabled' : ''}>\${state.loading ? '登录中…' : '登录并返回 WorkBuddy'}</button>
        </form>
        \${OAUTH_POPUP ? '<button class="btn link" type="button" onclick="cancelAuth()">取消授权，返回 WorkBuddy</button>' : ''}
        <p class="muted">这是 MCP 授权窗口，不是 SAP GUI。账号密码只用于校验身份。</p>\`;
      const userInput = document.querySelector("input[name=username]");
      if (userInput && !state.loading) userInput.focus();
    }

    boot();
  </script>
</body>
</html>`;
}
