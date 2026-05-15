import type { RealtimeVehicleState } from "@metro-ops/shared";

type FlushFn = (items: RealtimeVehicleState[], sentAt: string) => void;

export class RafBatcher {
  private queue: RealtimeVehicleState[] = [];
  private lastSentAt = "";
  private scheduled = false;

  constructor(private readonly flush: FlushFn) {}

  push(items: RealtimeVehicleState[], sentAt: string): void {
    this.queue.push(...items);
    this.lastSentAt = sentAt;
    if (!this.scheduled) {
      this.scheduled = true;
      const schedule =
        typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame
          : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
      schedule(() => this.drain());
    }
  }

  private drain(): void {
    this.scheduled = false;
    if (this.queue.length === 0) return;
    const dedup = new Map<string, RealtimeVehicleState>();
    for (const v of this.queue) dedup.set(v.vehicleId, v);
    this.queue = [];
    this.flush(Array.from(dedup.values()), this.lastSentAt);
  }
}
