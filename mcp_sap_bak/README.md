# mcp-sap-bak

bak 组织 **SAP 系统 MCP 服务**：把 `zbak_inf` 各 `ACTION` 包装为 MCP 工具，统一在一个 Streamable HTTP / stdio 进程里对外提供。

当前已接入：

| 工具 | SAP ACTION | 说明 |
|------|------------|------|
| `get_profit` | `GET_PROFIT` | 运营指标财务专家分析 |
| `sap_profit_schema` | — | 上述接口字段中文说明 |

后续新接口：在 `src/tools/<域>/` 增加模块，并在 `src/tools/index.ts` 注册即可。

本目录是 **MCP 工具层**。仓库根目录 `ai_chat` 里还有两套东西，不要和本服务混在一起：

| 目录 | 角色 | 谁在用 |
|------|------|--------|
| `mcp_sap_bak`（本仓库） | SAP MCP：工具、SAP 登录、OAuth、admin | WorkBuddy、Inspector、Cursor |
| `../backend` | AI 聊天 API（DeepSeek + 验证码登录） | `../frontend` 网页 |
| `../frontend` | Vue 聊天页面 | 浏览器用户 |

网页财务助手要跑 `backend`；只做 WorkBuddy / MCP 时改本目录即可。`backend` 聊天时会再当 MCP 客户端调用本服务。

## 架构

```
WorkBuddy / Cursor / Inspector
    │  MCP Streamable HTTP（Bearer token）
    ▼
mcp-sap-bak（Node）
    │  登录时：用户 SAP 账号密码 → ICF MCP_LOGIN
    │  调工具时：POST JSON + Basic Auth + ?ACTION=...
    ▼
SAP zbak_inf / zbak_mcp_demo
```

```
src/
  index.ts / stdio.ts     传输入口
  create-server.ts        创建 McpServer(mcp-sap-bak)
  sap-client.ts           通用 postAction(ACTION, body)
  config.ts / types.ts    环境与共享类型
  auth/                   用户登录页、OAuth 2.1、会话 cookie
  accounts/               账号库、token 加解密
  admin/                  管理页手工发 token
  tools/
    index.ts              汇总注册
    profit/               运营指标域
    demo/                 DEV 演示工具
  lib/mcp-result.ts       工具返回辅助
```

## 安装

```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
# 编辑 .env：SAP_*、MCP_AUTH_TOKEN
npm run build
npm start              # → http://127.0.0.1:3100/mcp
```

`SAP_BASE_URL` 填**网关基址、不要带 ACTION**，例如：

```bash
SAP_BASE_URL=http://192.168.1.164:8020/zbak_inf
```

若仍写成旧的 `...?ACTION=GET_PROFIT`，启动时会自动剥掉 `ACTION`（兼容多工具）。

## WorkBuddy：点连接如何登录 SAP

`mcp.json` **只配 URL，不要预填 Authorization**。首次点「连接」会走 MCP OAuth 2.1，弹出 SAP 账号密码；成功后客户端记住 token（默认约 30 天）。

```json
{
  "mcpServers": {
    "mcp-sap-bak-dev": {
      "type": "http",
      "url": "https://192.168.1.177/mcp-sap-bak-dev/mcp"
    }
  }
}
```

OAuth 的 `/token` 必须是 **HTTPS**（或 localhost）。内网 HTTP IP 会被 WorkBuddy / Inspector 拒绝。请把 `MCP_PUBLIC_URL` 配成 `https://...`，并保证 Nginx 443 上也有 MCP / OAuth 的 location。

### 连接时发生了什么

点「连接」不是 WorkBuddy 自己去 SAP 登录。WorkBuddy 只负责弹窗和存 token，账号密码只在本服务里校验 SAP。

```
点「连接」
    → WorkBuddy 访问 /mcp（此时还没有 token）
    → MCP 返回 401 + WWW-Authenticate（带资源元数据地址）
    → 读取 /.well-known/oauth-protected-resource/...
    → 读取 /.well-known/oauth-authorization-server/...
    → 动态注册 OAuth 客户端（记下 redirect_uri）
    → 打开授权窗 GET /authorize
    → 弹出「SAP 账号登录」页（不是 SAP GUI）
    → POST /api/login，用账号密码打 SAP MCP_LOGIN
    → 成功后签发一次性 code，浏览器跳到 WorkBuddy 的 redirect_uri
    → 系统唤起 WorkBuddy（看起来像「又打开了 WorkBuddy」）
    → WorkBuddy 拿 code 去 POST /token，换到 access_token + refresh_token
    → 本机保存这两张票，之后请求 /mcp 带 Authorization: Bearer ...
```

登录成功后页面会执行 `location.href = data.redirect`，地址类似 `workbuddy://callback?code=...&state=...`。这是标准 OAuth 回调，不是 MCP 去启动 WorkBuddy。

本服务签发的是 **MCP token**，不是 SAP SSO ticket。WorkBuddy **不会**保存 SAP 密码。

### Token 存在哪

| 存哪 | 存什么 | 作用 |
|------|--------|------|
| WorkBuddy 本机凭据库 | `access_token` + `refresh_token` | 关闭再开仍能连 MCP |
| 本服务账号库（`MCP_ACCOUNTS_FILE`） | token 密文、refresh 哈希、过期时间 | 校验这张票是否还有效 |
| 浏览器 cookie `mcp_user` / 登录页 localStorage | 网页登录会话 | 只方便再打开 `/login`，WorkBuddy 重连不靠它 |

再打开 WorkBuddy：读出上次的 `access_token` → 请求 `/mcp`。若 access 过期，用 `refresh_token` 打 `/token` 静默续期，**不会再弹登录**。refresh 失效、管理端作废、或超过 `MCP_LOGIN_TTL_DAYS` 才会再输 SAP 账号密码。

`.well-known` 只是发现文档（`/authorize`、`/token` 在哪），**不是登录凭证**。

### 演示时如何重现「点连接 → 输入密码」

清掉 WorkBuddy 里缓存的 `.well-known` **不够**。元数据没了只会重新拉授权地址；token 还在就不会弹登录。

1. 在 WorkBuddy 里把这个 MCP **断开 / 移除 / 清除授权**，再点连接。界面没有「断开」时，再去本机找 `token` / `oauth` / `credentials` 目录删除。名字带 `well-known` 的多半只是元数据缓存。
2. 还要演示「输入 SAP 账号密码」时：授权弹窗用无痕窗口，或清掉该站点 cookie（以及登录页 `localStorage` 的 `mcp_sap_login_...`）。只清 WorkBuddy token 时，浏览器 cookie 还在，弹窗可能跳过输入框。
3. 服务端账号库 **不用动**。

对照：

| 清这个 | 会不会再弹 SAP 登录 |
|--------|---------------------|
| WorkBuddy 的 `.well-known` 缓存 | 一般不会 |
| WorkBuddy 里保存的 OAuth token | 会再走授权 |
| 浏览器登录 cookie | 决定弹窗里要不要再输密码 |

演示口令：先断开 MCP（清 token），再用无痕完成一次连接。

### 手工 Token（备用）

客户端不支持 OAuth 弹窗时，打开 `/login`，登录后把页面上的 Token 写入 mcp.json。`/admin` 仍可手工发 Token。旧的 `MCP_AUTH_TOKEN` 也能用，走 env 里的 `SAP_USERNAME`。

本机直连示例：

```json
{
  "mcpServers": {
    "sap-bak": {
      "url": "http://127.0.0.1:3100/mcp",
      "headers": {
        "Authorization": "Bearer 你的token"
      }
    }
  }
}
```

## 新增一个 SAP 工具（约定）

1. 建目录 `src/tools/<域>/`
2. `register.ts` 里用 `server.registerTool(...)`，内部 `client.postAction("YOUR_ACTION", body)`
3. 在 `src/tools/index.ts` 调用 `registerXxxTools(server, client)`
4. `npm run build && npm start`

## 服务器部署（Nginx + systemd）

1. 目录：`/opt/mcp/mcp-sap-bak/`
2. systemd：`deploy/mcp-sap-bak.service.example`
3. Nginx：`deploy/nginx-mcp-sap-bak.conf.example`  
   对外示例：`https://域名/mcp-sap-bak/mcp`

## 本机 stdio（可选）

```bash
npm run start:stdio
```

```json
{
  "mcpServers": {
    "sap-bak": {
      "command": "node",
      "args": ["C:/Users/bak/Desktop/mcp1/dist/stdio.js"]
    }
  }
}
```

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `SAP_BASE_URL` | 网关基址（建议不含 ACTION） | 生产 `.../zbak_inf` |
| `SAP_USERNAME` | Basic Auth 用户 | 必填 |
| `SAP_PASSWORD` | Basic Auth 密码 | — |
| `SAP_TIMEOUT_MS` | 超时毫秒 | `30000` |
| `MCP_HOST` | HTTP 监听地址 | `127.0.0.1` |
| `MCP_PORT` | HTTP 端口 | `3100` |
| `MCP_PATH` | MCP 路径 | `/mcp` |
| `MCP_AUTH_TOKEN` | 共享 Bearer Token（兼容旧客户端） | 空=不强制 |
| `MCP_PUBLIC_URL` | 对外地址，OAuth issuer / 登录页用，需 HTTPS | 空=不启用 OAuth 弹窗 |
| `MCP_LOGIN_TTL_DAYS` | 自助登录 token 有效天数 | `30` |
| `MCP_LOGIN_TTL_HOURS` | 按小时过期；有值时优先于 DAYS，例如 `1` = 1 小时 | 空 |
| `MCP_ADMIN_PASSWORD` | `/admin` 密码 | 空=不启用管理页 |
| `MCP_ACCOUNTS_KEY` | 账号库加密密钥 | — |
| `MCP_ACCOUNTS_FILE` | 账号库文件 | — |
| `MCP_ALLOWED_HOSTS` | Host 白名单 | SDK 默认 |

更细的 MCP / Streamable HTTP 说明见 [`MCP流式HTTP说明.md`](./MCP流式HTTP说明.md)。多实例部署见 [`deploy/README.md`](./deploy/README.md)。
