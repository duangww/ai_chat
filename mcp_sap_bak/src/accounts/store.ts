import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  newId,
  newMcpToken,
} from "./crypto.js";

export type AccountSource = "admin" | "login";

export interface AccountRecord {
  id: string;
  sap_username: string;
  token_hash: string;
  token_prefix: string;
  /** 仅自助登录账号保存，便于再次展示同一 Token */
  token_enc?: string;
  refresh_hash?: string;
  remark: string;
  enabled: boolean;
  source?: AccountSource;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountPublic {
  id: string;
  sap_username: string;
  token_prefix: string;
  remark: string;
  enabled: boolean;
  source: AccountSource;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

interface StoreFile {
  version: 1;
  accounts: AccountRecord[];
  oauth_clients?: OAuthClientInformationFull[];
}

export interface ResolvedAccount {
  id: string;
  sap_username: string;
  remark: string;
}

function toPublic(row: AccountRecord): AccountPublic {
  return {
    id: row.id,
    sap_username: row.sap_username,
    token_prefix: row.token_prefix,
    remark: row.remark,
    enabled: row.enabled,
    source: row.source || "admin",
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isExpired(row: AccountRecord, now = Date.now()): boolean {
  if (!row.expires_at) return false;
  const exp = Date.parse(row.expires_at);
  return Number.isFinite(exp) && exp <= now;
}

function normalizeRow(raw: AccountRecord & { password_enc?: string }): AccountRecord {
  return {
    id: raw.id,
    sap_username: raw.sap_username,
    token_hash: raw.token_hash,
    token_prefix: raw.token_prefix,
    token_enc: raw.token_enc,
    refresh_hash: raw.refresh_hash,
    remark: raw.remark,
    enabled: raw.enabled,
    source: raw.source || "admin",
    expires_at: raw.expires_at,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export class AccountStore {
  constructor(private readonly filePath: string) {}

  private empty(): StoreFile {
    return { version: 1, accounts: [], oauth_clients: [] };
  }

  private read(): StoreFile {
    if (!existsSync(this.filePath)) return this.empty();
    const raw = readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return this.empty();
    const data = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(data.accounts)) return this.empty();
    return {
      version: 1,
      accounts: data.accounts.map(normalizeRow),
      oauth_clients: Array.isArray(data.oauth_clients) ? data.oauth_clients : [],
    };
  }

  private write(data: StoreFile): void {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  list(): AccountPublic[] {
    return this.read().accounts.map(toPublic);
  }

  create(input: {
    sap_username: string;
    remark?: string;
  }): { account: AccountPublic; token: string } {
    const username = input.sap_username.trim().toUpperCase();
    if (!username) throw new Error("SAP 账号不能为空");

    const token = newMcpToken();
    const now = new Date().toISOString();
    const row: AccountRecord = {
      id: newId(),
      sap_username: username,
      token_hash: hashToken(token),
      token_prefix: token.slice(0, 8),
      remark: (input.remark || "").trim(),
      enabled: true,
      source: "admin",
      created_at: now,
      updated_at: now,
    };

    const data = this.read();
    data.accounts.push(row);
    this.write(data);
    return { account: toPublic(row), token };
  }

  update(
    id: string,
    patch: {
      remark?: string;
      enabled?: boolean;
    }
  ): AccountPublic {
    const data = this.read();
    const row = data.accounts.find((a) => a.id === id);
    if (!row) throw new Error("账号不存在");
    if (patch.remark != null) row.remark = patch.remark.trim();
    if (patch.enabled != null) row.enabled = patch.enabled;
    row.updated_at = new Date().toISOString();
    this.write(data);
    return toPublic(row);
  }

  rotateToken(id: string): { account: AccountPublic; token: string } {
    const data = this.read();
    const row = data.accounts.find((a) => a.id === id);
    if (!row) throw new Error("账号不存在");
    const token = newMcpToken();
    row.token_hash = hashToken(token);
    row.token_prefix = token.slice(0, 8);
    row.updated_at = new Date().toISOString();
    this.write(data);
    return { account: toPublic(row), token };
  }

  remove(id: string): void {
    const data = this.read();
    const next = data.accounts.filter((a) => a.id !== id);
    if (next.length === data.accounts.length) throw new Error("账号不存在");
    data.accounts = next;
    this.write(data);
  }

  resolveByToken(token: string): ResolvedAccount | null {
    const hash = hashToken(token);
    const row = this.read().accounts.find(
      (a) => a.enabled && a.token_hash === hash && !isExpired(a)
    );
    if (!row) return null;
    return {
      id: row.id,
      sap_username: row.sap_username,
      remark: row.remark,
    };
  }

  getAccount(id: string): AccountPublic {
    const row = this.read().accounts.find((a) => a.id === id);
    if (!row) throw new Error("账号不存在");
    return toPublic(row);
  }

  /**
   * 登录签发：始终换新 token，并按当前 TTL 重写 expires_at。
   * 不再复用未过期旧票，否则改短 TTL 后 WorkBuddy 会一直拿着 30 天的旧 token。
   */
  issueLoginToken(
    sapUsername: string,
    key: Buffer,
    ttlMs: number
  ): { account: AccountPublic; token: string } {
    const username = sapUsername.trim().toUpperCase();
    if (!username) throw new Error("SAP 账号不能为空");

    const data = this.read();
    const now = Date.now();
    const existing = data.accounts.find(
      (a) => a.sap_username === username && a.enabled && (a.source || "admin") === "login"
    );

    const token = newMcpToken();
    const ts = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();

    if (existing) {
      existing.token_hash = hashToken(token);
      existing.token_prefix = token.slice(0, 8);
      existing.token_enc = encryptSecret(token, key);
      existing.refresh_hash = undefined;
      existing.expires_at = expiresAt;
      existing.source = "login";
      existing.updated_at = ts;
      this.write(data);
      return { account: toPublic(existing), token };
    }

    const row: AccountRecord = {
      id: newId(),
      sap_username: username,
      token_hash: hashToken(token),
      token_prefix: token.slice(0, 8),
      token_enc: encryptSecret(token, key),
      remark: "用户自助登录",
      enabled: true,
      source: "login",
      expires_at: expiresAt,
      created_at: ts,
      updated_at: ts,
    };
    data.accounts.push(row);
    this.write(data);
    return { account: toPublic(row), token };
  }

  /**
   * OAuth refresh：换新 access，但保留原来的 expires_at（绝对过期，避免每小时续一次就永远不重新登录）。
   */
  rotateAccessToken(
    accountId: string,
    key: Buffer
  ): { account: AccountPublic; token: string } {
    const data = this.read();
    const row = data.accounts.find((a) => a.id === accountId);
    if (!row || !row.enabled || isExpired(row)) {
      throw new Error("登录已过期，请重新登录");
    }
    const token = newMcpToken();
    const ts = new Date().toISOString();
    row.token_hash = hashToken(token);
    row.token_prefix = token.slice(0, 8);
    row.token_enc = encryptSecret(token, key);
    row.updated_at = ts;
    this.write(data);
    return { account: toPublic(row), token };
  }

  saveRefreshToken(accountId: string, refreshToken: string): void {
    const data = this.read();
    const row = data.accounts.find((a) => a.id === accountId);
    if (!row) throw new Error("账号不存在");
    row.refresh_hash = hashToken(refreshToken);
    row.updated_at = new Date().toISOString();
    this.write(data);
  }

  resolveByRefreshToken(refreshToken: string): ResolvedAccount | null {
    const hash = hashToken(refreshToken);
    const row = this.read().accounts.find(
      (a) => a.enabled && a.refresh_hash === hash && !isExpired(a)
    );
    if (!row) return null;
    return {
      id: row.id,
      sap_username: row.sap_username,
      remark: row.remark,
    };
  }

  findLoginAccount(sapUsername: string): AccountPublic | null {
    const username = sapUsername.trim().toUpperCase();
    const row = this.read().accounts.find(
      (a) =>
        a.sap_username === username &&
        a.enabled &&
        (a.source || "admin") === "login" &&
        !isExpired(a)
    );
    return row ? toPublic(row) : null;
  }

  revealLoginToken(accountId: string, key: Buffer): string | null {
    const row = this.read().accounts.find((a) => a.id === accountId);
    if (!row?.token_enc || !row.enabled || isExpired(row)) return null;
    try {
      return decryptSecret(row.token_enc, key);
    } catch {
      return null;
    }
  }

  listOAuthClients(): OAuthClientInformationFull[] {
    return this.read().oauth_clients || [];
  }

  getOAuthClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.listOAuthClients().find((c) => c.client_id === clientId);
  }

  saveOAuthClient(client: OAuthClientInformationFull): OAuthClientInformationFull {
    const data = this.read();
    const clients = data.oauth_clients || [];
    const idx = clients.findIndex((c) => c.client_id === client.client_id);
    if (idx >= 0) clients[idx] = client;
    else clients.push(client);
    data.oauth_clients = clients;
    this.write(data);
    return client;
  }
}
