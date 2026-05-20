import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import type { TripTask } from "@metro-ops/shared";
import { apiFetch } from "../api/client.js";
import {
  findDutyForOperator,
  findTripForDuty,
  findTripForOperator,
  importedTripIdForDuty,
  type CurrentDutiesResponse,
} from "../runtime/duties.js";
import type { OperatorContext } from "@metro-ops/shared";

interface TripDetailResponse {
  trip: TripTask;
}

export function AttachedRouteEntry() {
  const operator = useQuery({
    queryKey: ["operators", "me"],
    queryFn: () => apiFetch<OperatorContext>("/api/operators/me"),
  });

  const activeTrips = useQuery({
    queryKey: ["trips", "active"],
    queryFn: () => apiFetch<TripTask[]>("/api/trips/active"),
  });

  const runtime = useQuery({
    queryKey: ["runtime", "duties"],
    queryFn: () => apiFetch<CurrentDutiesResponse>("/api/runtime/duties"),
  });

  const currentDuty = findDutyForOperator(runtime.data?.duties ?? [], operator.data);
  const dutyTrip = findTripForDuty(activeTrips.data ?? [], currentDuty);
  const assignedTrip = findTripForOperator(activeTrips.data ?? [], operator.data);
  const fallbackVersionId = runtime.data?.activeSchedule.scheduleVersionId;
  const fallbackTripId = currentDuty
    ? importedTripIdForDuty(currentDuty)
    : undefined;

  const dutyTripDetail = useQuery({
    queryKey: ["trip", fallbackTripId, "entry"],
    queryFn: () => apiFetch<TripDetailResponse>(`/api/trips/${fallbackTripId}`),
    enabled: !dutyTrip && !!fallbackTripId,
    retry: false,
  });

  const fallbackTrip = useQuery({
    queryKey: ["trips", "history", fallbackVersionId, "first"],
    queryFn: () =>
      apiFetch<TripTask[]>(
        `/api/trips/history?scheduleVersionId=${encodeURIComponent(fallbackVersionId ?? "")}&limit=1`,
      ),
    enabled:
      !dutyTrip &&
      !assignedTrip &&
      (!fallbackTripId || dutyTripDetail.isError) &&
      !!fallbackVersionId,
  });

  const tripId =
    dutyTrip?.id ??
    dutyTripDetail.data?.trip.id ??
    assignedTrip?.id ??
    activeTrips.data?.[0]?.id ??
    fallbackTrip.data?.[0]?.id;

  if (tripId) {
    return <Navigate to={`/attached-route/${tripId}`} replace />;
  }

  if (
    operator.isLoading ||
    activeTrips.isLoading ||
    runtime.isLoading ||
    dutyTripDetail.isLoading ||
    fallbackTrip.isLoading
  ) {
    return (
      <div className="p-margin-mobile md:p-lg text-sm text-on-surface-variant">
        加载中...
      </div>
    );
  }

  return (
    <div className="p-margin-mobile md:p-lg text-sm text-on-surface-variant">
      暂无可打开的交路任务
    </div>
  );
}
