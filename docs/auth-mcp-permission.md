# AI Chat 账号认证与 MCP 权限（关键步骤）

本文记录已测试通过的：**SAP 登录认证**、**ZMCP/ZTOOL 工具权限**、**登录验证码**、以及与聊天 Backend 的集成方式。

## 1. 总体架构

```
浏览器登录页
  → POST /api/auth/captcha（取图）
  → POST /api/auth/login（验证码 + SAP 账号密码）
       → Backend 校验验证码
       → Basic Auth 调用 SAP MCP_LOGIN
       → 签发 JWT（含 user + tools，不含密码）
  → 后续 /api/chat 带 Bearer JWT
       → 按 tools 过滤 AI 可用 MCP 工具
       → 服务级 Bearer 调用 mcp_sap_bak 执行工具
```

| 层级 | 职责 |
|------|------|
| SAP | ICF Basic Auth 验密；`ZMCP`/`ZTOOL` 授权；`MCP_LOGIN` 返回工具列表 |
| Backend | 验证码、JWT、按角色过滤 tools、代理聊天与 MCP |
| Frontend | 登录表单、验证码 UI、请求带 Token |

**原则：** 不自建用户库；不以明文存 SAP 密码；旧接口 `GET_USER_AUTH` 不用于 AI Chat。

---

## 2. SAP 侧关键步骤

### 2.1 权限对象

1. 创建权限对象 **`ZMCP`**（说明：AI MCP 权限）
2. 字段 **`ZTOOL`**：大写 domain，长度 ≤ 40（权限值硬限制）
3. **`ZTOOL` 存工具短码**（与 MCP/ACTION 对齐，大写），例如：
   - `GET_PROFIT`
   - `SAP_PROFIT_SCHEMA`
   - `*`（全部工具，由 Backend 展开本地目录）
4. PFCG 角色中维护 `ZMCP` → `ZTOOL`，分配给用户
5. 新建对象后如需管理员全权，**重新生成 `SAP_ALL`**（否则可能检不到新对象）

### 2.2 登录接口 `MCP_LOGIN`

- URL：`http://<host>:<port>/zbak_inf?ACTION=MCP_LOGIN`
- 方法：`POST`
- 认证：**HTTP Basic**（SAP 用户名/密码），由 SICF 验密
- Body：`{}`（可不读）
- 实现类：`ZBAKCL_INF` → 方法 `MCP_LOGIN`

成功响应示例：

```json
{
  "user_id": "BAKKF",
  "user_name": "开发1",
  "type": "S",
  "message": "MCP登录认证成功",
  "tools": [
    {
      "tool": "SAP_PROFIT_SCHEMA",
      "tool_text": "专家分析运营指标字段说明"
    },
    {
      "tool": "GET_PROFIT",
      "tool_text": "查询专家分析运营指标数据"
    }
  ]
}
```

权限查询要点（已按用户过滤）：

```abap
SELECT DISTINCT a~low
  INTO TABLE @lt_tools
  FROM agr_1251 AS a
  INNER JOIN agr_users AS b
    ON a~agr_name = b~agr_name
   AND b~uname    = @ls_out-user_id
   AND b~from_dat LE @sy-datum
   AND b~to_dat   GE @sy-datum
 WHERE a~object  = 'ZMCP'
   AND a~field   = 'ZTOOL'
   AND a~deleted = @space.
```

`AGR_1251` 无行时的兜底风格（项目约定）：

- `AUTHORITY-CHECK OBJECT 'ZMCP' ID 'ZTOOL' DUMMY`
- 通过则返回 `tools: [{ "tool": "*", "tool_text": "..." }]`（或等价结构）
- Backend 见到 `tool === '*'` 时开放全部已注册工具

**业务 ACTION（如 `GET_PROFIT`）入口仍须再做一次 `AUTHORITY-CHECK`**，不能只信登录返回的列表。

---

## 3. Backend 关键步骤

### 3.1 环境变量（`backend/.env.local`）

```bash
DEEPSEEK_API_KEY=...
PORT=3000

SAP_LOGIN_URL=http://192.168.1.164:8020/zbak_inf?ACTION=MCP_LOGIN

JWT_SECRET=<生产环境请换成长随机串>
JWT_EXPIRES_SEC=28800

MCP_BASE=http://192.168.1.177/mcp-sap-bak/mcp
MCP_TOKEN=<与 mcp_sap_bak 的 MCP_AUTH_TOKEN 一致>
```

### 3.2 依赖与启动

```bash
cd backend
pnpm install
pnpm dev    # 或 pnpm start
```

### 3.3 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/captcha` | 返回 `{ captchaId, image }`（SVG base64，5 分钟、一次性） |
| POST | `/api/auth/login` | body: `username, password, captchaId, captchaCode` → JWT |
| GET | `/api/auth/me` | Bearer JWT → 当前用户与 tools |
| POST | `/api/chat` | Bearer JWT；按 tools 过滤后调用 AI + MCP |

### 3.4 工具名映射

| SAP `ZTOOL`（大写） | Backend / MCP tool key |
|---------------------|-------------------------|
| `GET_PROFIT` | `get_profit` |
| `SAP_PROFIT_SCHEMA` | `sap_profit_schema` |
| `*` | 全部本地注册工具 |

边界统一：比对前对 SAP 侧码做大写；过滤逻辑见 `backend/auth.js` 的 `filterToolKeys`。

### 3.5 关键文件

- `backend/auth.js` — SAP 登录、JWT、工具过滤
- `backend/captcha.js` — 图形验证码
- `backend/server.js` — 路由与聊天

---

## 4. Frontend 关键步骤

### 4.1 依赖与启动

```bash
cd frontend
pnpm install
pnpm dev
```

- 开发代理：`/api` → `http://localhost:3000`（见 `vite.config.ts`）
- Node 建议：`^22.18 || >=24.12`（Vite 8）；缺依赖时报 `rolldown` 可先 `CI=true pnpm install`

### 4.2 登录页

- 控件：Ant Design Vue（`a-form` / `a-input` / `a-input-password` / `a-flex` / `a-button` / `a-tooltip`）
- 字段：SAP 账号、密码、验证码（点击图片刷新）
- 失败时自动刷新验证码

### 4.3 关键文件

- `frontend/src/views/LoginView.vue`
- `frontend/src/stores/auth.ts`
- `frontend/src/types/auth.ts`
- `frontend/src/composables/useChat.ts`（聊天请求带 `Authorization: Bearer`）

---

## 5. MCP Server（工具执行）

聊天链路中，**工具执行仍用服务级 Bearer** 调 `mcp_sap_bak`（与终端用户密码无关）。  
用户级权限在 Backend 过滤 + SAP 业务 ACTION 二次检权。

```bash
cd mcp_sap_bak
pnpm install
pnpm build
pnpm start   # 或 pnpm dev
```

---

## 6. 本地联调检查清单（已测通）

1. SAP：`MCP_LOGIN` 已发布；测试用户 PFCG 含 `ZMCP`/`ZTOOL`
2. Backend：`pnpm dev`，日志出现 `🚀 服务已启动` 与 `🔐 SAP 登录: ...`
3. Frontend：`pnpm dev` → http://localhost:5173
4. 打开登录页 → 验证码可刷新 → 正确 SAP 账号登录成功
5. 进入聊天 → 仅能使用授权工具；无 Token 或过期返回 401
6. 注意：backend `--watch` 重启瞬间登录可能出现代理 502，等服务起来后重试

---

## 7. 安全约定（勿回退）

- 密码只用于当场 Basic Auth，**不入库、不进 JWT、不写日志**
- 验密交给 SICF，不自研对 `USR02` 比密
- AI Chat **不调用** 旧接口 `GET_USER_AUTH`
- 生产必须更换 `JWT_SECRET`；全链路尽量 HTTPS
- 列表接口可查 `AGR_*`；**业务执行必须以 `AUTHORITY-CHECK` 为准**

---

## 8. 后续可选增强

- 业务 ACTION 内强制检 `ZMCP`/`ZTOOL`
- 登录后短缓存 tools，或提供刷新接口
- 统一 IdP（IAS / Entra OIDC）替代 Basic（有企业 SSO 时）
- 复合角色场景扩展 `AGR_AGRS` 关联查询
