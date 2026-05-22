const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
const WS_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_WS_BASE_URL);

export function apiUrl(path: string): string {
  if (!API_BASE_URL) return path;
  return urlFromBase(path, API_BASE_URL).toString();
}

export function wsUrl(path: string): string {
  const baseUrl = WS_BASE_URL || API_BASE_URL;
  if (baseUrl) {
    const url = urlFromBase(path, baseUrl);
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    return url.toString();
  }
  if (typeof window === "undefined") return "";
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${path}`;
}

export function hasRemoteApiBaseUrl(): boolean {
  return API_BASE_URL !== "";
}

export function isExplicitDemoApiEnabled(): boolean {
  return parseBooleanFlag(import.meta.env.VITE_DEMO_API);
}

function urlFromBase(path: string, baseUrl: string): URL {
  if (baseUrl.startsWith("/")) {
    if (typeof window === "undefined") {
      throw new Error(`relative URL base requires a browser origin: ${baseUrl}`);
    }
    return new URL(path, new URL(baseUrl, window.location.origin));
  }
  return new URL(path, baseUrl);
}

function normalizeBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

function parseBooleanFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}
