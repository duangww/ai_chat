import { SapApiError } from "../sap-client.js";

/** MCP 工具成功返回（文本） */
export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/** MCP 工具错误返回 */
export function errorResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

export function formatCaughtError(err: unknown): string {
  if (err instanceof SapApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
