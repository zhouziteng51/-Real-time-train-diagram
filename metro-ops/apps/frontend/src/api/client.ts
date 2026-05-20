import { IDEMPOTENCY_HEADER } from "@metro-ops/shared";
import { apiUrl } from "./config.js";
import {
  canFallbackToDemoApi,
  demoApiFetch,
  shouldUseDemoApi,
} from "./demoApi.js";

export interface ApiFetchOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { body, idempotencyKey, headers = {}, ...rest } = opts;
  if (shouldUseDemoApi()) {
    return demoApiFetch<T>(path, { method: rest.method, body });
  }
  const init: RequestInit = {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...defaultAuthHeaders(),
      ...(idempotencyKey ? { [IDEMPOTENCY_HEADER]: idempotencyKey } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(apiUrl(path), init);
  } catch (err) {
    if (isApiPath(path) && canFallbackToDemoApi()) {
      return demoApiFetch<T>(path, { method: rest.method, body });
    }
    throw err;
  }
  if (!res.ok) {
    if (
      isApiPath(path) &&
      canFallbackToDemoApi() &&
      [404, 405, 502, 503, 504].includes(res.status)
    ) {
      return demoApiFetch<T>(path, { method: rest.method, body });
    }
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function isApiPath(path: string): boolean {
  return path.startsWith("/api/");
}

export function defaultAuthHeaders(role = "DISPATCHER"): Record<string, string> {
  return {
    "x-user-id": "op-001",
    "x-user-name": "local-dispatcher",
    "x-user-role": role,
  };
}

export function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
