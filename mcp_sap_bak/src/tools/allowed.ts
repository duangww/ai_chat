/** 工具白名单：undefined = 不限制；含 * = 全部 */

export type AllowedTools = string[] | undefined;

export function isToolAllowed(toolName: string, allowed?: AllowedTools): boolean {
  if (!allowed) return true;
  const names = allowed.map((t) => String(t).trim().toUpperCase()).filter(Boolean);
  if (names.length === 0) return false;
  if (names.includes("*")) return true;
  return names.includes(toolName.toUpperCase());
}
