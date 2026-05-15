import type { HistoryTripQuery } from "@metro-ops/shared";

export const HISTORY_TRIP_QUERY_KEYS = [
  "tripId",
  "trainNo",
  "routeId",
  "scheduleVersionId",
  "date",
  "operatorName",
] as const satisfies readonly (keyof HistoryTripQuery)[];

export type HistoryTripQueryKey = (typeof HISTORY_TRIP_QUERY_KEYS)[number];

export const HISTORY_QUERY_LABELS = {
  tripId: "任务",
  trainNo: "车次",
  routeId: "交路",
  scheduleVersionId: "运行图",
  date: "日期",
  operatorName: "司机",
} satisfies Record<HistoryTripQueryKey, string>;
