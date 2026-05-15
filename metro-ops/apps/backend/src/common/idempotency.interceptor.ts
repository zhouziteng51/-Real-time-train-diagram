import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { IDEMPOTENCY_HEADER } from "@metro-ops/shared";
import {
  Observable,
  catchError,
  from,
  map,
  of,
  tap,
  throwError,
} from "rxjs";

interface CacheEntry {
  result: unknown;
  statusCode?: number;
  expiresAt: number;
  inFlight: boolean;
  requestFingerprint: string;
  pending: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

const TTL_MS = 24 * 60 * 60 * 1000;

function hashBody(body: unknown): string {
  try {
    return JSON.stringify(body ?? null);
  } catch {
    return "<unhashable>";
  }
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly store = new Map<string, CacheEntry>();

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const method: string = req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next.handle();
    }

    const key = req.headers[IDEMPOTENCY_HEADER];
    if (typeof key !== "string" || key.length === 0) {
      return next.handle();
    }

    const now = Date.now();
    this.prune(now);
    const existing = this.store.get(key);
    const requestFingerprint = this.fingerprint(req);

    if (existing && existing.expiresAt > now) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new ConflictException(
          "Idempotency-Key already used with a different request signature",
        );
      }
      if (!existing.inFlight) {
        if (existing.statusCode !== undefined) res.status(existing.statusCode);
        return of(existing.result);
      }
      return from(existing.pending).pipe(
        map((result) => {
          const cached = this.store.get(key);
          if (cached?.statusCode !== undefined) res.status(cached.statusCode);
          return cached?.result ?? result;
        }),
      );
    }

    const deferred = this.createDeferred();
    this.store.set(key, {
      result: null,
      expiresAt: now + TTL_MS,
      inFlight: true,
      requestFingerprint,
      pending: deferred.promise,
      resolve: deferred.resolve,
      reject: deferred.reject,
    });

    return next.handle().pipe(
      tap((result) => {
        this.store.set(key, {
          result,
          statusCode: res.statusCode,
          expiresAt: Date.now() + TTL_MS,
          inFlight: false,
          requestFingerprint,
          pending: Promise.resolve(result),
          resolve: () => undefined,
          reject: () => undefined,
        });
        deferred.resolve(result);
      }),
      catchError((err) => {
        this.store.delete(key);
        deferred.reject(err);
        return throwError(() => err);
      }),
    );
  }

  private fingerprint(req: { method?: string; originalUrl?: string; url?: string; body?: unknown }): string {
    const method = req.method ?? "UNKNOWN";
    const url = req.originalUrl ?? req.url ?? "";
    return `${method}:${url}:${hashBody(req.body)}`;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.store) {
      if (!entry.inFlight && entry.expiresAt <= now) this.store.delete(key);
    }
  }

  private createDeferred(): {
    promise: Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  } {
    let resolve!: (value: unknown) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
}
