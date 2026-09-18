import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type {
  OAuthRegisteredClientsStore,
} from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  InvalidGrantError,
  InvalidRequestError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { AccountStore } from "../accounts/store.js";
import { newMcpToken } from "../accounts/crypto.js";
import { readUserSession } from "./session.js";

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

interface AuthCode {
  clientId: string;
  params: AuthorizationParams;
  sapUser: string;
  createdAt: number;
}

const CODE_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;

function oauthClientRedirect(
  params: AuthorizationParams,
  query: Record<string, string | undefined>
): string {
  const target = new URL(params.redirectUri);
  for (const [key, value] of Object.entries(query)) {
    if (value) target.searchParams.set(key, value);
  }
  return target.toString();
}

export class SapOAuthProvider implements OAuthServerProvider {
  private readonly pending = new Map<string, PendingAuth>();
  private readonly codes = new Map<string, AuthCode>();

  readonly clientsStore: OAuthRegisteredClientsStore;

  constructor(
    private readonly store: AccountStore,
    private readonly opts: {
      sessionSecret: string;
      accountsKey: Buffer;
      loginTtlMs: number;
      loginPath: string;
    }
  ) {
    const accounts = store;
    this.clientsStore = {
      getClient: (clientId) => accounts.getOAuthClient(clientId),
      registerClient: (client) =>
        accounts.saveOAuthClient(client as OAuthClientInformationFull),
    };
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, row] of this.pending) {
      if (now - row.createdAt > PENDING_TTL_MS) this.pending.delete(id);
    }
    for (const [id, row] of this.codes) {
      if (now - row.createdAt > CODE_TTL_MS) this.codes.delete(id);
    }
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    this.prune();
    // WorkBuddy 打开的是 /authorize。必须 302 到 /login，它才会把登录页亮出来。
    // 在 /authorize 直接 200 HTML 时，客户端会一直等 redirect，界面不弹窗。
    const req = res.req as Request;
    const session = readUserSession(req, this.opts.sessionSecret);
    if (!session) {
      for (const [id, row] of this.pending) {
        if (row.client.client_id === client.client_id) this.pending.delete(id);
      }
      const pendingId = randomUUID();
      this.pending.set(pendingId, { client, params, createdAt: Date.now() });
      res.redirect(
        302,
        `${this.opts.loginPath}?pending=${encodeURIComponent(pendingId)}`
      );
      return;
    }
    res.redirect(
      302,
      this.completePending(session.sap_username, {
        client,
        params,
        createdAt: Date.now(),
      })
    );
  }

  denyRedirect(
    params: AuthorizationParams,
    description = "login_cancelled"
  ): string {
    return oauthClientRedirect(params, {
      error: "access_denied",
      error_description: description,
      state: params.state,
    });
  }

  peekPending(pendingId: string): PendingAuth | undefined {
    this.prune();
    return this.pending.get(pendingId);
  }

  cancelPending(pendingId: string): string | undefined {
    this.prune();
    const row = this.pending.get(pendingId);
    if (!row) return undefined;
    this.pending.delete(pendingId);
    return this.denyRedirect(row.params, "login_cancelled");
  }

  completePending(
    sapUser: string,
    pending?: PendingAuth,
    pendingId?: string
  ): string {
    this.prune();
    const row =
      pending ||
      (pendingId ? this.pending.get(pendingId) : undefined);
    if (!row) {
      throw new InvalidRequestError("登录授权已过期，请在 WorkBuddy 里重新连接");
    }
    if (pendingId) this.pending.delete(pendingId);
    const code = randomUUID();
    this.codes.set(code, {
      clientId: row.client.client_id,
      params: row.params,
      sapUser,
      createdAt: Date.now(),
    });
    return oauthClientRedirect(row.params, {
      code,
      state: row.params.state,
    });
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const row = this.codes.get(authorizationCode);
    if (!row || row.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    return row.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const row = this.codes.get(authorizationCode);
    if (!row || row.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    this.codes.delete(authorizationCode);
    return this.issueTokens(row.sapUser);
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const account = this.store.resolveByRefreshToken(refreshToken);
    if (!account) {
      throw new InvalidGrantError("Refresh token 无效或已过期，请重新登录");
    }
    try {
      const rotated = this.store.rotateAccessToken(
        account.id,
        this.opts.accountsKey
      );
      const remainingMs = this.remainingTtlMs(rotated.account.expires_at);
      const refresh = newMcpToken();
      this.store.saveRefreshToken(account.id, refresh);
      return {
        access_token: rotated.token,
        token_type: "bearer",
        expires_in: Math.max(1, Math.floor(remainingMs / 1000)),
        refresh_token: refresh,
        scope: "mcp:tools",
      };
    } catch {
      throw new InvalidGrantError("登录已过期，请重新登录");
    }
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const account = this.store.resolveByToken(token);
    if (!account) throw new Error("Invalid token");
    const full = this.store.getAccount(account.id);
    return {
      token,
      clientId: "mcp-sap-bak",
      scopes: ["mcp:tools"],
      expiresAt: full.expires_at
        ? Math.floor(Date.parse(full.expires_at) / 1000)
        : Math.floor((Date.now() + this.opts.loginTtlMs) / 1000),
      extra: { sapUser: account.sap_username },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const account =
      this.store.resolveByToken(request.token) ||
      this.store.resolveByRefreshToken(request.token);
    if (!account) return;
    this.store.saveRefreshToken(account.id, newMcpToken());
  }

  private remainingTtlMs(expiresAt?: string): number {
    if (!expiresAt) return this.opts.loginTtlMs;
    const exp = Date.parse(expiresAt);
    if (!Number.isFinite(exp)) return this.opts.loginTtlMs;
    return Math.max(0, exp - Date.now());
  }

  private issueTokens(sapUser: string, accountId?: string): OAuthTokens {
    const issued = this.store.issueLoginToken(
      sapUser,
      this.opts.accountsKey,
      this.opts.loginTtlMs
    );
    const refresh = newMcpToken();
    this.store.saveRefreshToken(accountId || issued.account.id, refresh);
    return {
      access_token: issued.token,
      token_type: "bearer",
      expires_in: Math.floor(this.opts.loginTtlMs / 1000),
      refresh_token: refresh,
      scope: "mcp:tools",
    };
  }
}
