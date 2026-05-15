import { create, type StateCreator } from "zustand";
import type {
  CurrentDutyContext,
  OperatorContext,
} from "@metro-ops/shared";

interface OperatorSlice {
  operatorContext: OperatorContext | undefined;
  setOperatorContext: (ctx: OperatorContext | undefined) => void;
}

interface DutySlice {
  currentDuty: CurrentDutyContext | undefined;
  archivePending: boolean;
  setCurrentDuty: (duty: CurrentDutyContext | undefined) => void;
  markArchivePending: (pending: boolean) => void;
  resetDuty: () => void;
}

interface SelectionSlice {
  selectedTripId: string | undefined;
  selectedTrainNo: string | undefined;
  setSelectedTrip: (payload: { tripId?: string; trainNo?: string } | undefined) => void;
}

interface ScheduleSlice {
  activeScheduleVersionId: string | undefined;
  setActiveScheduleVersion: (id: string | undefined) => void;
}

export type AppStoreState = OperatorSlice & DutySlice & SelectionSlice & ScheduleSlice;

const operatorSlice: StateCreator<AppStoreState, [], [], OperatorSlice> = (set) => ({
  operatorContext: undefined,
  setOperatorContext: (ctx) => set({ operatorContext: ctx }),
});

const dutySlice: StateCreator<AppStoreState, [], [], DutySlice> = (set) => ({
  currentDuty: undefined,
  archivePending: false,
  setCurrentDuty: (duty) => set({ currentDuty: duty }),
  markArchivePending: (pending) => set({ archivePending: pending }),
  resetDuty: () => set({ currentDuty: undefined, archivePending: false }),
});

const selectionSlice: StateCreator<AppStoreState, [], [], SelectionSlice> = (set) => ({
  selectedTripId: undefined,
  selectedTrainNo: undefined,
  setSelectedTrip: (payload) =>
    set({ selectedTripId: payload?.tripId, selectedTrainNo: payload?.trainNo }),
});

const scheduleSlice: StateCreator<AppStoreState, [], [], ScheduleSlice> = (set) => ({
  activeScheduleVersionId: undefined,
  setActiveScheduleVersion: (id) => set({ activeScheduleVersionId: id }),
});

export const useAppStore = create<AppStoreState>()((...a) => ({
  ...operatorSlice(...a),
  ...dutySlice(...a),
  ...selectionSlice(...a),
  ...scheduleSlice(...a),
}));
