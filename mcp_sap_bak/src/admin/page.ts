export const ADMIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MCP 账号 Token 管理</title>
  <style>
    :root { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; }
    body { margin: 0; background: #f3f4f6; }
    .wrap { max-width: 960px; margin: 32px auto; padding: 0 16px 48px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .sub { color: #6b7280; margin-bottom: 24px; font-size: 14px; }
    .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
    label { display: block; font-size: 13px; color: #4b5563; margin: 10px 0 4px; }
    input, textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    button { border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 14px; }
    .btn { background: #2563eb; color: #fff; }
    .btn.gray { background: #e5e7eb; color: #111827; }
    .btn.red { background: #dc2626; color: #fff; }
    .btn.sm { padding: 6px 10px; font-size: 12px; margin-right: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    th { color: #6b7280; font-weight: 600; }
    .ok { color: #059669; }
    .off { color: #dc2626; }
    .flash { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 12px; border-radius: 8px; margin-bottom: 12px; word-break: break-all; }
    .err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
    .login { max-width: 360px; margin: 80px auto; }
    .muted { color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div id="app" class="wrap"></div>
  <script>
    const state = { accounts: [], tokenOnce: "", error: "", login: true };

    async function api(path, opts = {}) {
      const res = await fetch(path, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        ...opts,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }

    async function trySession() {
      try {
        state.accounts = (await api("api/admin/accounts")).accounts;
        state.login = false;
        state.error = "";
      } catch {
        state.login = true;
      }
      render();
    }

    async function login(e) {
      e.preventDefault();
      state.error = "";
      try {
        await api("api/admin/login", {
          method: "POST",
          body: JSON.stringify({ password: e.target.password.value }),
        });
        await trySession();
      } catch (err) {
        state.error = err.message;
        render();
      }
    }

    async function createAccount(e) {
      e.preventDefault();
      state.error = "";
      state.tokenOnce = "";
      const f = e.target;
      try {
        const data = await api("api/admin/accounts", {
          method: "POST",
          body: JSON.stringify({
            sap_username: f.sap_username.value,
            remark: f.remark.value,
          }),
        });
        state.tokenOnce = data.token;
        f.reset();
        await reload();
      } catch (err) {
        state.error = err.message;
        render();
      }
    }

    async function reload() {
      state.accounts = (await api("api/admin/accounts")).accounts;
      render();
    }

    async function toggle(id, enabled) {
      await api("api/admin/accounts/" + id, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await reload();
    }

    async function rotate(id) {
      if (!confirm("将作废旧 Token，Workbuddy 需改成新 Token。继续？")) return;
      const data = await api("api/admin/accounts/" + id + "/rotate", { method: "POST" });
      state.tokenOnce = data.token;
      await reload();
    }

    async function removeAcc(id) {
      if (!confirm("确定删除该映射？")) return;
      await api("api/admin/accounts/" + id, { method: "DELETE" });
      await reload();
    }

    async function preview(id) {
      try {
        const data = await api("api/admin/accounts/" + id + "/tools");
        alert((data.user_name || data.sap_username) + " 可用工具:\\n" + (data.tools || []).join("\\n"));
      } catch (err) {
        alert(err.message);
      }
    }

    function render() {
      const el = document.getElementById("app");
      if (state.login) {
        el.className = "login";
        el.innerHTML = \`
          <div class="card">
            <h1>MCP 账号管理</h1>
            <p class="sub">请输入管理密码</p>
            \${state.error ? '<div class="err">'+state.error+'</div>' : ''}
            <form onsubmit="login(event)">
              <label>密码</label>
              <input name="password" type="password" autocomplete="current-password" required />
              <p><button class="btn" type="submit">登录</button></p>
            </form>
          </div>\`;
        return;
      }
      el.className = "wrap";
      el.innerHTML = \`
        <h1>MCP 账号 Token 管理</h1>
        <p class="sub">普通用户请走 <a href="login">/login</a> 用 SAP 账号密码自助登录。本页仅管理映射；接口用 env 通用账号调用，工具权限查 AGR_1251（ZMCP / ZTOOL）。</p>
        \${state.error ? '<div class="err">'+state.error+'</div>' : ''}
        \${state.tokenOnce ? '<div class="flash">请立即复制 Token（只显示一次）：<br><b>'+state.tokenOnce+'</b></div>' : ''}
        <div class="card">
          <h3 style="margin-top:0">新增映射</h3>
          <form onsubmit="createAccount(event)">
            <label>SAP 业务账号</label>
            <input name="sap_username" required placeholder="请输入 SAP 账号" />
            <label>备注</label>
            <input name="remark" placeholder="Workbuddy 张三" />
            <p><button class="btn" type="submit">生成 Token</button></p>
          </form>
        </div>
        <div class="card">
          <table>
            <thead><tr>
              <th>SAP 账号</th><th>来源</th><th>Token 前缀</th><th>备注</th><th>状态</th><th>操作</th>
            </tr></thead>
            <tbody>
              \${state.accounts.map(a => \`
                <tr>
                  <td>\${a.sap_username}</td>
                  <td>\${a.source === 'login' ? '自助登录' : '管理员'}</td>
                  <td>\${a.token_prefix}…</td>
                  <td>\${a.remark || '-'}</td>
                  <td class="\${a.enabled ? 'ok' : 'off'}">\${a.enabled ? '启用' : '停用'}</td>
                  <td>
                    <button class="btn sm gray" onclick="preview('\${a.id}')">查 SAP 工具</button>
                    <button class="btn sm gray" onclick="toggle('\${a.id}', \${!a.enabled})">\${a.enabled ? '停用' : '启用'}</button>
                    <button class="btn sm gray" onclick="rotate('\${a.id}')">换 Token</button>
                    <button class="btn sm red" onclick="removeAcc('\${a.id}')">删除</button>
                  </td>
                </tr>\`).join('') || '<tr><td colspan="6" class="muted">暂无账号</td></tr>'}
            </tbody>
          </table>
        </div>
      \`;
    }

    trySession();
  </script>
</body>
</html>
`;
