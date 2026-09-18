import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const USER_COOKIE = "mcp_user";

function sign(secret: string, payload: string): string {
  const body = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsign(secret: string, token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

export interface UserSession {
  sap_username: string;
  exp: number;
}

export function readUserSession(
  req: Request,
  secret: string
): UserSession | null {
  const raw = unsign(secret, readCookie(req, USER_COOKIE));
  if (!raw) return null;
  try {
    const body = JSON.parse(raw) as UserSession;
    if (!body.sap_username || Number(body.exp) <= Date.now()) return null;
    return { sap_username: String(body.sap_username).toUpperCase(), exp: Number(body.exp) };
  } catch {
    return null;
  }
}

export function setUserSessionCookie(
  res: Response,
  secret: string,
  session: UserSession,
  cookiePath: string
): void {
  const token = sign(secret, JSON.stringify(session));
  const maxAge = Math.max(0, Math.floor((session.exp - Date.now()) / 1000));
  const path = cookiePath || "/";
  res.setHeader(
    "Set-Cookie",
    `${USER_COOKIE}=${token}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}

export function clearUserSessionCookie(res: Response, cookiePath: string): void {
  const path = cookiePath || "/";
  res.setHeader(
    "Set-Cookie",
    `${USER_COOKIE}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function cookiePathFromPublicUrl(publicUrl?: string): string {
  if (!publicUrl) return "/";
  try {
    const pathName = new URL(publicUrl).pathname.replace(/\/+$/, "");
    return pathName || "/";
  } catch {
    return "/";
  }
}
