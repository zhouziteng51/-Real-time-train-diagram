import { create } from "zustand";
import type { HistoryTripQuery } from "@metro-ops/shared";
import { HISTORY_TRIP_QUERY_KEYS } from "../navigation/historyQuery.js";

interface HistoryQueryStoreState {
  query: Partial<HistoryTripQuery>;
  patchQuery: (patch: Partial<HistoryTripQuery>) => void;
  resetQuery: () => void;
  hydrateFromUrl: (params: URLSearchParams) => void;
}

export const useHistoryQueryStore = create<HistoryQueryStoreState>((set) => ({
  query: {},
  patchQuery: (patch) =>
    set((s) => {
      const next = { ...s.query };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === null) delete (next as Record<string, unknown>)[k];
        else (next as Record<string, unknown>)[k] = v;
      }
      return { query: next };
    }),
  resetQuery: () => set({ query: {} }),
  hydrateFromUrl: (params) =>
    set(() => {
      const q: Partial<HistoryTripQuery> = {};
      for (const key of HISTORY_TRIP_QUERY_KEYS) {
        const val = params.get(key);
        if (val) (q as Record<string, unknown>)[key] = val;
      }
      return { query: q };
    }),
}));
