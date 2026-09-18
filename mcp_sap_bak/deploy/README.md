# 同一份 dist，多实例（DEV / 以后 QAS）

现有 `mcp-sap-bak.service` **不用改名、不用停太久**：升级 `dist` 后重启即可，默认 `MCP_TOOLSET=profit`。

## 1. 发布代码

在 Linux 上覆盖 `/opt/mcp/mcp-sap-bak` 的 `dist`（及 `node_modules` 如有依赖变化）。

```bash
systemctl restart mcp-sap-bak
curl -s http://127.0.0.1:3100/health
# 期望：toolset=profit，service=mcp-sap-bak
```

## 2. 增加 DEV 实例

```bash
sudo mkdir -p /etc/mcp
sudo cp deploy/mcp-sap-bak-dev.env.example /etc/mcp/mcp-sap-bak-dev.env
sudo vim /etc/mcp/mcp-sap-bak-dev.env   # 填 DEV 地址、账号、独立 Token

sudo cp deploy/mcp-sap-bak@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mcp-sap-bak@dev
curl -s http://127.0.0.1:3101/health
# 期望：toolset=demo，service=mcp-sap-bak-dev
```

## 3. Nginx

把 `deploy/nginx.mcp-sap-bak.conf` 里 **DEV 那段 location** 加进现有 server；生产 `/mcp-sap-bak/` 保持原样。

```bash
sudo nginx -t && sudo nginx -s reload
```

WorkBuddy 推荐只配 URL（建议 HTTPS），由用户自己登录：

```
https://<linux>/mcp-sap-bak-dev/mcp
```

不要再预填 Authorization。首次连接会弹出 SAP 账号密码；登录成功后客户端记住 Token。

登录链路、token 存哪、演示时如何重置，见仓库根目录 [`README.md`](../README.md) 的「WorkBuddy：点连接如何登录 SAP」。

若客户端不支持 OAuth 弹窗，打开 `https://<linux>/mcp-sap-bak-dev/login` 登录后，把页面上的 Token 写入 mcp.json。

前端 `backend` 的 `MCP_BASE` 仍指向 `/mcp-sap-bak/mcp`（网页聊天走 `../backend`，不是本服务替代品）。

## 4. 账号 / Token 管理（Workbuddy）

用户登录页：`http://192.168.1.177/mcp-sap-bak-dev/login`  
管理页：`http://192.168.1.177/mcp-sap-bak-dev/admin`

1. SAP PFCG：权限对象 `ZMCP` 字段 `ZTOOL` 赋 `GET_MAKTX` / `GET_STOCK`（或 `*`）
2. 拷贝 ABAP 方法里的 `AUTHORITY-CHECK` 到 `ZCL_MCP_DEMO`
3. env 增加 `MCP_ADMIN_PASSWORD`、`MCP_ACCOUNTS_KEY`、`MCP_ACCOUNTS_FILE`、`MCP_PUBLIC_URL`
4. 覆盖 `dist` 后 `systemctl restart mcp-sap-bak@dev`
5. WorkBuddy mcp.json 只配 URL。用户用自己的 SAP 账号密码登录，Token 自动记住（约 30 天）
6. 演示要重新弹出登录：在 WorkBuddy 里断开/移除该 MCP（清 token）。只清 `.well-known` 缓存不够；要再输入密码时用无痕窗口或清站点 cookie

管理员仍可在 `/admin` 手工发 Token。现有 `MCP_AUTH_TOKEN` 仍可用，走 env 里的 `SAP_USERNAME`。

ICF 必须允许业务用户用自己的 SAP 密码调用 `zbak_mcp_demo`（用户登录会用该账号做 Basic 校验）。

## 5. 以后 QAS

复制 `mcp-sap-bak-dev.env` → `/etc/mcp/mcp-sap-bak-qas.env`，改端口（如 3102）、`MCP_SERVER_NAME`、`SAP_BASE_URL`，然后：

```bash
sudo systemctl enable --now mcp-sap-bak@qas
```
