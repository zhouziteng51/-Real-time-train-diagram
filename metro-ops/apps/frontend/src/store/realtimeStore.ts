import { create } from "zustand";
import type { RealtimeVehicleState } from "@metro-ops/shared";

export type ConnectionStatus = "CONNECTING" | "ONLINE" | "OFFLINE";

interface RealtimeStoreState {
  connectionStatus: ConnectionStatus;
  lastSyncAt?: string;
  vehiclesById: Record<string, RealtimeVehicleState>;
  setConnectionStatus: (status: ConnectionStatus) => void;
  replaceVehicles: (items: RealtimeVehicleState[], sentAt: string) => void;
}

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  connectionStatus: "OFFLINE",
  vehiclesById: {},
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  replaceVehicles: (items, sentAt) =>
    set((state) => {
      const next: Record<string, RealtimeVehicleState> = {};
      for (const v of items) next[v.vehicleId] = v;
      return { vehiclesById: next, lastSyncAt: sentAt };
    }),
}));
