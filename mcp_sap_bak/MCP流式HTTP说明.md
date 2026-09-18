# MCP 与 Streamable HTTP 说明（给 ABAP 开发者）

本文用 ABAP / SAP 里熟悉的概念，说明：

1. MCP 是什么  
2. 本项目怎么把 SAP REST 接口包装成 MCP 工具  
3. 「流式 HTTP」（Streamable HTTP）在代码里怎么实现  

对应源码主要在 `src/` 目录。

---

## 1. 一句话类比

| 你熟悉的 SAP 世界 | MCP 世界 |
|------------------|----------|
| RFC / OData / REST 接口 | MCP **工具（Tool）** |
| SE37 函数签名（IMPORTING） | 工具的 **参数 schema** |
| 返回结构 / JSON body | 工具的 **返回 content** |
| 调用方：外部系统、Fiori、Postman | 调用方：Cursor / AI 客户端 |
| 传输：HTTP、RFC | 传输：**stdio** 或 **Streamable HTTP** |

**MCP（Model Context Protocol）** 是一套协议：让 AI 客户端按统一格式发现并调用「工具」，而不必为每个系统写死集成逻辑。

本项目做的事很简单：

```
Cursor（AI）
    │  MCP 协议（JSON-RPC）
    ▼
本机 Node 服务（mcp-sap-bak）
    │  普通 HTTP POST + Basic Auth + ?ACTION=...
    ▼
你的 SAP 网关 zbak_inf（各 ACTION，如 GET_PROFIT）
```

SAP 侧仍然是原来的 REST；变的是「谁来调」——从 Postman/程序，变成 AI 通过 MCP 调。  
一个 MCP 进程可挂多个工具（按 `tools/<域>/` 扩展），不必每个 ACTION 起一个服务。

---

## 2. MCP 三个核心概念

### 2.1 工具（Tool）

类似一个远程函数模块：有名字、参数、返回值。

本项目注册了两个工具：

| 工具名 | 作用 | 类比 |
|--------|------|------|
| `get_profit` | 查运营指标 | `CALL FUNCTION 'Z_GET_PROFIT'` |
| `sap_profit_schema` | 返回字段中文说明 | 读接口文档 / 数据结构说明 |

注册代码在 `src/tools/profit/register.ts`（用官方推荐的 `registerTool`，不再用已弃用的 `server.tool`）：

```ts
server.registerTool(
  "get_profit",
  {
    description: "查询 SAP 运营指标…",
    inputSchema: {
      bukrs: z.string().min(1).max(4).describe("公司代码，如 1100"),
      // ...
    },
  },
  async (args) => { /* 调 SAP */ }
);
```

`z.string()` / `z.enum()` 是参数校验（类似 ABAP 的类型检查 + 域值检查）。AI 调用时必须带合法参数，否则在进入 SAP 前就被拦住。

工具真正干活时：组 JSON → `client.postAction("GET_PROFIT", body)` → 把结果当文本还给 AI。

### 2.2 传输层（Transport）——消息怎么走

MCP 规定「说什么」（JSON-RPC 消息），但「走哪条路」可以换：

| 传输方式 | 怎么连 | 适用场景 |
|----------|--------|----------|
| **stdio** | Cursor 启动本机进程，用标准输入/输出传 JSON | 本机调试 |
| **Streamable HTTP** | Cursor 用 HTTP 访问一个 URL | 服务器部署、多人共用、Nginx 反代 |

**重要：工具逻辑完全一样。**  
`create-server.ts` 只注册工具；`stdio.ts` 和 `index.ts` 只是换「接线方式」。

类比 ABAP：

- 业务逻辑 = Function Module（`tools/<域>/register.ts`）  
- 接入方式 = RFC 或 HTTP 服务（stdio / Streamable HTTP）

### 2.3 消息格式（JSON-RPC 2.0）

两边交换的是 JSON，大致像：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_profit",
    "arguments": {
      "bukrs": "1100",
      "period_type": "M",
      "gjahr": "2025",
      "monat": 1
    }
  }
}
```

你不需要手写这些；Cursor 会自动发。你只要保证服务端能收并处理。

---

## 3. 两种入口：stdio vs Streamable HTTP

### 3.1 stdio（本机管道）

文件：`src/stdio.ts`

```11:17:src/stdio.ts
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new SapClient(config);
  const server = createSapMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

流程：

1. Cursor 按配置执行 `node dist/stdio.js`  
2. 父子进程之间用 stdin/stdout 传 MCP 消息  
3. 没有端口、没有 URL，只能本机用  

适合：你自己调试。不适合：给同事一个 URL 接入。

### 3.2 Streamable HTTP（本项目默认）

文件：`src/index.ts`

这就是「流式 HTTP 访问」的实现入口。

---

## 4. Streamable HTTP 到底是什么？

### 4.1 先忘掉「流」字，抓住本质

对大多数调用（含本项目的 `get_profit`）：

> **客户端对某个 URL 发 HTTP POST，body 里是 MCP/JSON-RPC；服务端处理后把结果写回 HTTP 响应。**

这和你调 SAP 的 `POST /zbak_inf?ACTION=GET_PROFIT` **形态非常像**。

「Streamable」是协议能力：需要时可用 SSE（Server-Sent Events）把响应**边算边推**。  
本项目工具是「一次查完再返回」，多数时候就是普通请求-响应；SDK 仍按官方 **Streamable HTTP** 规范实现，以便 Cursor 等客户端按标准对接。

### 4.2 有会话 vs 无会话

SDK 支持两种模式：

| 模式 | `sessionIdGenerator` | 含义 |
|------|----------------------|------|
| 有状态 | 生成 UUID | 像保持会话：后续请求要带 Session ID |
| **无状态（本项目）** | `undefined` | 每个请求独立，像无状态 REST |

本项目用的是无状态：

```47:51:src/index.ts
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
```

类比：每次 HTTP 调用都新建一次「MCP 服务实例」，处理完就关掉——类似无状态 REST，不依赖会话 cookie。

### 4.3 和旧版 SSE 传输的区别（了解即可）

早期 MCP 还有「单独开一条 SSE 长连接」的方式。  
现在推荐的是 **Streamable HTTP**：主要用 **POST**，必要时在同协议下支持流式；部署更像普通 API（易 Nginx 反代）。

---

## 5. 本项目 Streamable HTTP 实现拆解

整体结构：

```
Express 监听 127.0.0.1:3100
    │
    ├─ GET  /health     → 健康检查（运维用）
    │
    └─ POST /mcp        → MCP 主入口
           │
           ├─ Bearer Token 校验（可选）
           ├─ 创建 MCP Server（注册 get_profit 等）
           ├─ 创建 StreamableHTTPServerTransport
           ├─ connect + handleRequest
           └─ 响应结束后 close
```

### 5.1 启动 HTTP 服务

```68:86:src/index.ts
async function main(): Promise<void> {
  const sap = loadConfig();
  const http = loadHttpConfig();
  const client = new SapClient(sap);

  const app = createMcpExpressApp({
    host: http.host,
    allowedHosts: http.allowedHosts,
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "mcp-sap-bak" });
  });

  const auth = bearerAuth(http.authToken);

  app.post(http.path, auth, (req, res) => {
    void handleMcp(client, req, res);
  });
```

要点：

- `createMcpExpressApp`：官方 SDK 提供的 Express 应用，带 Host 校验等安全默认项  
- `/health`：给 systemd / 运维探测「进程活着」  
- `MCP_PATH`（默认 `/mcp`）：MCP 协议入口路径  

### 5.2 认证（Bearer Token）

```17:38:src/index.ts
function bearerAuth(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!token) {
      next();
      return;
    }
    const header = req.headers.authorization;
    const ok =
      header === `Bearer ${token}` ||
      header === `bearer ${token}` ||
      header === token;
    if (!ok) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    next();
  };
}
```

注意两层认证不要混淆：

| 层级 | 谁校验 | 凭证 |
|------|--------|------|
| Cursor → MCP 服务 | Node（`MCP_AUTH_TOKEN`） | `Authorization: Bearer ...` |
| MCP 服务 → SAP | Node（`SAP_USERNAME` / `SAP_PASSWORD`） | HTTP Basic Auth |

Cursor 用户**不需要**知道 SAP 账号；只拿 Bearer Token 访问 MCP。SAP 账号只存在服务器 `.env` 里。

### 5.3 处理一次 MCP 请求（核心）

```40:66:src/index.ts
async function handleMcp(
  client: SapClient,
  req: Request,
  res: Response
): Promise<void> {
  const server = createSapMcpServer(client);
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    // ... 返回 JSON-RPC 500
  }
}
```

逐步对照：

| 步骤 | 代码在做什么 | ABAP 类比 |
|------|--------------|-----------|
| 1 | `createSapMcpServer(client)` | 创建 mcp-sap-bak 并注册全部工具 |
| 2 | `new StreamableHTTPServerTransport(...)` | 准备 HTTP 适配器 |
| 3 | `server.connect(transport)` | 把「业务」接到「传输」 |
| 4 | `transport.handleRequest(req, res, body)` | 解析 JSON-RPC，调对应 tool，写 HTTP 响应 |
| 5 | `close` | 释放资源 |

**你几乎不用自己解析 JSON-RPC**；`handleRequest` 由官方 SDK 完成。你只负责注册工具和调 SAP。

### 5.4 为什么还有 GET / DELETE？

```88:102:src/index.ts
  // Streamable HTTP：部分客户端会发 GET/DELETE；无会话时返回 405
  app.get(http.path, auth, (_req, res) => {
    res.status(405).json({ ... });
  });
  app.delete(http.path, auth, (_req, res) => {
    res.status(405).json({ ... });
  });
```

规范里：有会话时，客户端可能用 GET 开 SSE 流、用 DELETE 结束会话。  
本项目是无会话，不支持这些，所以直接 **405 Method Not Allowed**。真正干活的是 **POST**。

---

## 6. SAP 调用层（和 MCP 无关的纯 REST）

文件：`src/sap-client.ts`

通用网关客户端：`postAction(action, payload)`，内部拼 `zbak_inf?ACTION=...`，和你在 Postman 里测的一样：

```ts
await client.postAction<GetProfitResponse>("GET_PROFIT", body);
```

配置来自 `.env`（`src/config.ts`）：

- `SAP_BASE_URL` → 网关基址（建议不含 ACTION），如 `.../zbak_inf`  
- `SAP_USERNAME` / `SAP_PASSWORD` → Basic Auth  
- `MCP_HOST` / `MCP_PORT` / `MCP_PATH` / `MCP_AUTH_TOKEN` → HTTP 监听与鉴权  

---

## 7. 端到端调用链（一次查询）

```
1. 用户在 Cursor 里问：「查 1100 公司 2025 年 1 月运营指标」

2. Cursor 发现 MCP 工具 get_profit，组装参数：
   bukrs=1100, period_type=M, gjahr=2025, monat=1

3. Cursor → HTTP POST https://域名/.../mcp
   Header: Authorization: Bearer <MCP_AUTH_TOKEN>
   Body:   JSON-RPC tools/call

4. index.ts
   → bearerAuth 通过
   → handleMcp
   → create-server 里 get_profit 回调执行

5. sap-client.ts
   → POST SAP_BASE_URL
   → Basic Auth
   → 拿到 { type, message, data[] }

6. 结果以 MCP content（文本/JSON）返回给 Cursor

7. AI 用自然语言向用户解释 data[]
```

你在 SAP 里仍然只维护原来的 `GET_PROFIT`；MCP 是外面的「适配壳」。

---

## 8. 源码职责一览

```
src/
  create-server.ts      ← 创建 mcp-sap-bak，调用 registerAllTools
  tools/index.ts        ← 汇总各业务域
  tools/profit/         ← 运营指标（registerTool + GET_PROFIT）
  sap-client.ts         ← 通用 postAction（与 MCP 协议无关）
  types.ts              ← 共享配置类型
  config.ts             ← 读 .env
  index.ts / stdio.ts   ← 传输入口
```

依赖关系：

```
index.ts / stdio.ts
        │
        ▼
 create-server.ts → tools/* → sap-client.postAction → SAP zbak_inf
        │
        ▼
  MCP SDK（协议 + 传输）
```

---

## 9. Cursor 怎么连（HTTP）

用户侧配置示例（连远程或本机 HTTP）：

```json
{
  "mcpServers": {
    "sap-bak": {
      "url": "http://127.0.0.1:3100/mcp",
      "headers": {
        "Authorization": "Bearer 与服务器 MCP_AUTH_TOKEN 一致"
      }
    }
  }
}
```

- `url`：指向 Streamable HTTP 的 POST 地址  
- `headers`：带上 Bearer Token  

经 Nginx 反代后，把 `url` 换成公网路径即可，例如：  
`https://你的域名/mcp-sap-bak/mcp`

部署细节见 `README.md` 与 `deploy/` 示例。

---

## 10. 常见误解（给 ABAP 同事）

1. **「流式」不是说 SAP 接口要改成流式输出**  
   SAP 仍是一次 POST、一次 JSON 返回。流式是 MCP 传输层能力。

2. **MCP 不是替代 RFC/OData**  
   它是给 AI 客户端用的标准「工具协议」；背后仍调你现有 REST。

3. **stdio 和 HTTP 业务逻辑相同**  
   换入口只为换接入方式，不必维护两套 `get_profit`。

4. **无状态 = 每个请求新建 server+transport**  
   实现简单、易水平扩展；代价是不做跨请求会话（本场景不需要）。

5. **Bearer 和 Basic 是两层门**  
   外层保护 MCP URL；内层保护 SAP。用户只接触外层 Token。

---

## 11. 自己验证（可选）

```bash
# 编译并启动 HTTP
npm run build
npm start

# 健康检查（普通 HTTP，不是 MCP）
curl http://127.0.0.1:3100/health
```

在 Cursor 里配置好 `url` + Bearer 后，对话中让 AI 调用 `get_profit` 或 `sap_profit_schema`，即可验证整条链路。

---

## 12. 小结

| 问题 | 答案 |
|------|------|
| MCP 是什么？ | AI 调用外部能力的标准协议（工具 + JSON-RPC） |
| 本项目核心业务在哪？ | `tools/<域>/` + `sap-client.postAction` |
| 流式 HTTP 实现在哪？ | `index.ts`：Express + `StreamableHTTPServerTransport` |
| 和 SAP 的关系？ | Node 当适配器，按 ACTION 调 `zbak_inf` |
| 为何用 HTTP 而不是只 stdio？ | 可部署到服务器，经 Nginx 给多人用 URL 接入 |

若只记一句：

> **把 bak 组织 SAP（zbak_inf）各 ACTION 包进同一个 mcp-sap-bak；用 Streamable HTTP 挂在 URL 上，让 Cursor 像调 API 一样调用。**
