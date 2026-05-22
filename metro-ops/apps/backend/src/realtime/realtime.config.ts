export const DEFAULT_WS_PORT = 3001;

export function resolveWsPort(value = process.env.WS_PORT): number {
  const candidate = Number(String(value ?? "").trim() || DEFAULT_WS_PORT);
  if (!Number.isFinite(candidate) || candidate <= 0) return DEFAULT_WS_PORT;
  return Math.trunc(candidate);
}
