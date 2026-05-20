export function apiUrl(path: string): string {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) return path;
  return new URL(path, baseUrl).toString();
}

export function wsUrl(path: string): string {
  const baseUrl = apiBaseUrl();
  if (baseUrl) {
    const url = new URL(path, baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
  if (typeof window === "undefined") return "";
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${path}`;
}

export function hasRemoteApiBaseUrl(): boolean {
  return apiBaseUrl() !== "";
}

function apiBaseUrl(): string {
  return normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

function normalizeBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}
