import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import type { TripTask } from "@metro-ops/shared";
import { apiFetch } from "../api/client.js";

interface CurrentTimeResponse {
  iso: string;
  timeZone: "Asia/Shanghai";
  localDate: string;
  localTime: string;
}

interface ActiveOperatingSchedule {
  scheduleVersionId: string;
  scheduleVersionName?: string | undefined;
  label: string;
  source: "IMPORTED" | "FALLBACK";
  importedAt?: string | undefined;
  sourceFileName?: string | undefined;
}

interface CurrentDutiesResponse {
  currentTime: CurrentTimeResponse;
  activeSchedule: ActiveOperatingSchedule;
}

export function AttachedRouteEntry() {
  const activeTrips = useQuery({
    queryKey: ["trips", "active"],
    queryFn: () => apiFetch<TripTask[]>("/api/trips/active"),
  });

  const runtime = useQuery({
    queryKey: ["runtime", "duties"],
    queryFn: () => apiFetch<CurrentDutiesResponse>("/api/runtime/duties"),
  });

  const firstTrip = activeTrips.data?.[0];
  const fallbackVersionId = runtime.data?.activeSchedule.scheduleVersionId;

  const fallbackTrip = useQuery({
    queryKey: ["trips", "history", fallbackVersionId, "first"],
    queryFn: () =>
      apiFetch<TripTask[]>(
        `/api/trips/history?scheduleVersionId=${encodeURIComponent(fallbackVersionId ?? "")}&limit=1`,
      ),
    enabled: !firstTrip && !!fallbackVersionId,
  });

  const tripId = firstTrip?.id ?? fallbackTrip.data?.[0]?.id;

  if (tripId) {
    return <Navigate to={`/attached-route/${tripId}`} replace />;
  }

  if (activeTrips.isLoading || runtime.isLoading || fallbackTrip.isLoading) {
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
