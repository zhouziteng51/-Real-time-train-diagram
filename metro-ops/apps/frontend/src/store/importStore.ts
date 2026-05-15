import { create } from "zustand";
import type { ImportJob } from "@metro-ops/shared";

interface ImportStoreState {
  currentJobId: string | undefined;
  jobsById: Record<string, ImportJob>;
  setCurrentJob: (id: string | undefined) => void;
  upsertJob: (job: ImportJob) => void;
  removeJob: (id: string) => void;
}

export const useImportStore = create<ImportStoreState>((set) => ({
  jobsById: {},
  currentJobId: undefined,
  setCurrentJob: (id) => set({ currentJobId: id }),
  upsertJob: (job) => set((s) => ({ jobsById: { ...s.jobsById, [job.id]: job } })),
  removeJob: (id) =>
    set((s) => {
      const next = { ...s.jobsById };
      delete next[id];
      return { jobsById: next };
    }),
}));
