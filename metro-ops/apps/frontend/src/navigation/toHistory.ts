import type { NavigateFunction } from "react-router-dom";
import { createSearchParams } from "react-router-dom";
import type { TripTask } from "@metro-ops/shared";
import { HISTORY_TRIP_QUERY_KEYS } from "./historyQuery.js";

type NonEmptyStringRecord = Record<string, string>;
type HistoryNavigationKey = (typeof HISTORY_TRIP_QUERY_KEYS)[number] | "from";
type HistoryNavigationParams = Partial<Record<HistoryNavigationKey, string | undefined>>;

const HISTORY_NAVIGATION_KEYS = [...HISTORY_TRIP_QUERY_KEYS, "from"] as const;

function buildSearch(params: HistoryNavigationParams): string {
  const clean: NonEmptyStringRecord = {};
  for (const key of HISTORY_NAVIGATION_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0) clean[key] = value;
  }
  return createSearchParams(clean).toString();
}

type AttachedRouteHistoryPayload = Pick<
  TripTask,
  "id" | "trainNo" | "routeId" | "scheduleVersionId" | "plannedDepartureAt"
>;

export function goToHistoryFromAttachedRoute(
  navigate: NavigateFunction,
  trip: AttachedRouteHistoryPayload,
) {
  navigate({
    pathname: "/history-trips",
    search: buildSearch({
      tripId: trip.id,
      trainNo: trip.trainNo,
      routeId: trip.routeId,
      scheduleVersionId: trip.scheduleVersionId,
      date: trip.plannedDepartureAt.slice(0, 10),
      from: "attached-route",
    }),
  });
}

export function goToHistoryFromMasterSchedule(
  navigate: NavigateFunction,
  payload: { trainNo?: string; routeId?: string; scheduleVersionId?: string; date?: string },
) {
  navigate({
    pathname: "/history-trips",
    search: buildSearch({
      trainNo: payload.trainNo,
      routeId: payload.routeId,
      scheduleVersionId: payload.scheduleVersionId,
      date: payload.date,
      from: "master-schedule",
    }),
  });
}

export function goToHistoryFromDashboard(navigate: NavigateFunction) {
  navigate({
    pathname: "/history-trips",
    search: buildSearch({ from: "dashboard" }),
  });
}
