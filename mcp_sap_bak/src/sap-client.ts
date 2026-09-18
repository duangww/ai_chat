import type { SapClientConfig } from "./types.js";

export class SapApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "SapApiError";
  }
}

/**
 * bak 组织 SAP ICF 网关客户端（zbak_inf / zbak_mcp_demo 等）。
 * 各业务通过 ACTION 区分，例如 GET_PROFIT、MCP_GET_MAKTX。
 */
export class SapClient {
  constructor(private readonly config: SapClientConfig) {}

  private authHeader(): string {
    const token = Buffer.from(
      `${this.config.username}:${this.config.password}`,
      "utf8"
    ).toString("base64");
    return `Basic ${token}`;
  }

  /** 拼出带 ACTION 的完整 URL */
  actionUrl(action: string): string {
    const url = new URL(this.config.baseUrl);
    url.searchParams.set("ACTION", action);
    return url.toString();
  }

  /**
   * POST JSON 到 <SAP_BASE_URL>?ACTION=...
   * 若配置了 mcpUser，自动带上 uname（业务账号，供 SAP 查 AGR_1251）。
   */
  async postAction<T>(action: string, payload: unknown = {}): Promise<T> {
    const endpoint = this.actionUrl(action);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const body =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? {
            ...(payload as Record<string, unknown>),
            ...(this.config.mcpUser
              ? { uname: this.config.mcpUser }
              : {}),
          }
        : payload;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new SapApiError(
          `SAP HTTP ${res.status} [${action}]: ${text.slice(0, 500)}`,
          res.status,
          text
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new SapApiError(
          `SAP 返回非 JSON [${action}]：${text.slice(0, 500)}`,
          res.status,
          text
        );
      }
    } catch (err) {
      if (err instanceof SapApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new SapApiError(
          `SAP 请求超时（${this.config.timeoutMs}ms）[${action}]: ${endpoint}`
        );
      }
      throw new SapApiError(
        `SAP 请求失败 [${action}]: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
