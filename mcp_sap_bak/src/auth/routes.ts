import type { Express, Request, Response } from "express";
import { deriveKey } from "../accounts/crypto.js";
import type { AccountStore } from "../accounts/store.js";
import type { HttpServerConfig, SapClientConfig } from "../types.js";
import { loginPageHtml } from "./login-page.js";
import type { SapOAuthProvider } from "./oauth-provider.js";
import { verifySapUserLogin } from "./sap-login.js";
import {
  clearUserSessionCookie,
  cookiePathFromPublicUrl,
  readUserSession,
  setUserSessionCookie,
} from "./session.js";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function checkLoginRate(ip: string): void {
  const now = Date.now();
  const cur = loginAttempts.get(ip);
  if (!cur || cur.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  cur.count += 1;
  if (cur.count > 15) {
    throw new Error("登录尝试过多，请稍后再试");
  }
}

function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

function publicMcpUrl(http: HttpServerConfig): string {
  if (http.publicUrl) return `${http.publicUrl}${http.path}`;
  return `http://${http.host}:${http.port}${http.path}`;
}

function loginUrl(http: HttpServerConfig): string {
  const base = http.publicUrl || "";
  return base ? `${base}/login` : "/login";
}

export function mountLoginRoutes(
  app: Express,
  opts: {
    store: AccountStore;
    sap: SapClientConfig;
    http: HttpServerConfig;
    oauth?: SapOAuthProvider;
  }
): void {
  const { store, sap, http, oauth } = opts;
  const secret = http.accountsKey;
  const key = deriveKey(http.accountsKey);
  const cookiePath = cookiePathFromPublicUrl(http.publicUrl);
  const mcpUrl = publicMcpUrl(http);

  const sessionToPayload = (sapUsername: string) => {
    const account = store.findLoginAccount(sapUsername);
    const token = account ? store.revealLoginToken(account.id, key) : null;
    return {
      ok: true,
      sap_username: sapUsername,
      token,
      expires_at: account?.expires_at,
      mcp_url: mcpUrl,
      login_url: loginUrl(http),
      server_name: http.serverName,
    };
  };

  app.get("/login", (_req, res) => {
    res.type("html").send(
      loginPageHtml({
        serverName: http.serverName,
        mcpUrl,
        apiBase: cookiePathFromPublicUrl(http.publicUrl) === "/"
          ? ""
          : cookiePathFromPublicUrl(http.publicUrl),
        loginTtlMs: http.loginTtlMs,
      })
    );
  });

  app.get("/api/login/status", (req, res) => {
    const session = readUserSession(req, secret);
    if (session) {
      res.json(sessionToPayload(session.sap_username));
      return;
    }
    const raw = String(req.headers.authorization || "");
    const token = raw.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const account = store.resolveByToken(token);
      if (account) {
        res.json({
          ok: true,
          sap_username: account.sap_username,
          token,
          expires_at: store.getAccount(account.id).expires_at,
          mcp_url: mcpUrl,
          login_url: loginUrl(http),
          server_name: http.serverName,
        });
        return;
      }
    }
    res.status(401).json({ ok: false, error: "未登录" });
  });

  const finishLogin = async (
    req: Request,
    res: Response,
    sapUsername: string,
    pending?: string
  ) => {
    const issued = store.issueLoginToken(sapUsername, key, http.loginTtlMs);
    setUserSessionCookie(
      res,
      secret,
      { sap_username: sapUsername, exp: Date.now() + http.loginTtlMs },
      cookiePath
    );
    let redirect: string | undefined;
    if (pending && oauth) {
      redirect = oauth.completePending(sapUsername, undefined, pending);
    }
    res.json({
      ok: true,
      sap_username: sapUsername,
      token: issued.token,
      expires_at: issued.account.expires_at,
      mcp_url: mcpUrl,
      server_name: http.serverName,
      redirect,
    });
  };

  app.post("/api/login", async (req, res) => {
    try {
      checkLoginRate(clientIp(req));
      const username = String(req.body?.username || "");
      const password = String(req.body?.password || "");
      const pending = String(req.body?.pending || "");
      const verified = await verifySapUserLogin(sap, username, password);
      await finishLogin(req, res, verified.sap_username, pending);
    } catch (err) {
      sendError(res, 401, err instanceof Error ? err.message : String(err));
    }
  });

  app.post("/api/login/continue", (req, res) => {
    const session = readUserSession(req, secret);
    if (!session) {
      sendError(res, 401, "未登录或会话已过期");
      return;
    }
    const pending = String(req.body?.pending || "");
    if (!pending || !oauth) {
      res.json({ ok: true, sap_username: session.sap_username });
      return;
    }
    try {
      const redirect = oauth.completePending(
        session.sap_username,
        undefined,
        pending
      );
      res.json({ ok: true, redirect });
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
  });

  app.post("/api/logout", (_req, res) => {
    clearUserSessionCookie(res, cookiePath);
    res.json({ ok: true });
  });
}

export function mcpUnauthorized(
  res: Response,
  resourceMetadataUrl?: string
): void {
  if (resourceMetadataUrl) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="SAP MCP", resource_metadata="${resourceMetadataUrl}"`
    );
  }
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}
