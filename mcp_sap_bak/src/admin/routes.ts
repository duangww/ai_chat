import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { fetchSapAllowedTools } from "../accounts/sap-tools.js";
import type { AccountStore } from "../accounts/store.js";
import { SapClient } from "../sap-client.js";
import type { SapClientConfig } from "../types.js";
import { ADMIN_PAGE_HTML } from "./page.js";

const COOKIE = "mcp_admin";
const TTL_MS = 8 * 60 * 60 * 1000;

function sign(secret: string, exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(secret: string, token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(body.exp) > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req: Request): string | undefined {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE) return rest.join("=");
  }
  return undefined;
}

function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

export function mountAdminRoutes(
  app: Express,
  opts: {
    adminPassword: string;
    store: AccountStore;
    sap: SapClientConfig;
  }
): void {
  const { adminPassword, store, sap } = opts;

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (verify(adminPassword, readCookie(req))) {
      next();
      return;
    }
    sendError(res, 401, "未登录或会话已过期");
  };

  app.get("/admin", (_req, res) => {
    res.type("html").send(ADMIN_PAGE_HTML);
  });

  app.post("/api/admin/login", (req, res) => {
    const password = String(req.body?.password || "");
    const a = Buffer.from(password);
    const b = Buffer.from(adminPassword);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      sendError(res, 401, "管理密码错误");
      return;
    }
    const token = sign(adminPassword, Date.now() + TTL_MS);
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TTL_MS / 1000)}`
    );
    res.json({ ok: true });
  });

  app.get("/api/admin/accounts", requireAdmin, (_req, res) => {
    res.json({ accounts: store.list() });
  });

  app.post("/api/admin/accounts", requireAdmin, (req, res) => {
    try {
      const result = store.create({
        sap_username: String(req.body?.sap_username || ""),
        remark: String(req.body?.remark || ""),
      });
      res.json(result);
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
  });

  app.patch("/api/admin/accounts/:id", requireAdmin, (req, res) => {
    try {
      const account = store.update(String(req.params.id), {
        remark: req.body?.remark != null ? String(req.body.remark) : undefined,
        enabled:
          req.body?.enabled == null ? undefined : Boolean(req.body.enabled),
      });
      res.json({ account });
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
  });

  app.post("/api/admin/accounts/:id/rotate", requireAdmin, (req, res) => {
    try {
      res.json(store.rotateToken(String(req.params.id)));
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
  });

  app.delete("/api/admin/accounts/:id", requireAdmin, (req, res) => {
    try {
      store.remove(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
  });

  app.get("/api/admin/accounts/:id/tools", requireAdmin, async (req, res) => {
    try {
      const acc = store.getAccount(String(req.params.id));
      const client = new SapClient({
        ...sap,
        mcpUser: acc.sap_username,
      });
      const tools = await fetchSapAllowedTools(client);
      res.json({
        sap_username: acc.sap_username,
        tools,
      });
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
  });
}
