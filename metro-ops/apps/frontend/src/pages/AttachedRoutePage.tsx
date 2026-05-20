import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { TripEvent, TripTask } from "@metro-ops/shared";
import { apiFetch, randomIdempotencyKey } from "../api/client.js";
import { useAppStore } from "../store/index.js";
import { goToHistoryFromAttachedRoute } from "../navigation/toHistory.js";
import {
  directionLabel,
  locationKindLabel,
  realtimeStatusLabel,
  tripEventKindLabel,
  tripEventSourceLabel,
  tripStatusLabel,
} from "../format/display.js";
import {
  findDutyForTrip,
  formatScheduleSource,
  formatStationPair,
  formatTimeRange,
  type CurrentDutiesResponse,
} from "../runtime/duties.js";

interface TripDetailResponse {
  trip: TripTask;
  events: TripEvent[];
}

interface TripMutationResponse {
  trip: TripTask;
  event: TripEvent;
}

export function AttachedRoutePage() {
  const params = useParams();
  const tripId = params.tripId;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const archivePending = useAppStore((s) => s.archivePending);
  const markArchivePending = useAppStore((s) => s.markArchivePending);
  const setSelectedTrip = useAppStore((s) => s.setSelectedTrip);

  useEffect(() => {
    if (!tripId) return;
    setSelectedTrip({ tripId });
    return () => setSelectedTrip(undefined);
  }, [setSelectedTrip, tripId]);

  const tripQuery = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => apiFetch<TripDetailResponse>(`/api/trips/${tripId}`),
    enabled: !!tripId,
  });

  const runtime = useQuery({
    queryKey: ["runtime", "duties"],
    queryFn: () => apiFetch<CurrentDutiesResponse>("/api/runtime/duties"),
    refetchInterval: 1000,
  });

  const applyTripMutationResult = (res: TripMutationResponse) => {
    qc.setQueryData<TripDetailResponse>(["trip", tripId], (current) => ({
      trip: res.trip,
      events: [...(current?.events ?? []), res.event],
    }));
    qc.invalidateQueries({ queryKey: ["trip", tripId] });
    qc.invalidateQueries({ queryKey: ["trips", "active"] });
    qc.invalidateQueries({ queryKey: ["trips", "history"] });
  };

  const startMutation = useMutation({
    mutationFn: () =>
      apiFetch<TripMutationResponse>(`/api/trips/${tripId}/start`, {
        method: "POST",
        body: {},
        idempotencyKey: randomIdempotencyKey(),
      }),
    onSuccess: applyTripMutationResult,
  });

  const arriveMutation = useMutation({
    mutationFn: () =>
      apiFetch<TripMutationResponse>(`/api/trips/${tripId}/arrive-terminal`, {
        method: "POST",
        body: { source: "OPERATOR", occurredAt: new Date().toISOString() },
        idempotencyKey: randomIdempotencyKey(),
      }),
    onSuccess: applyTripMutationResult,
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      apiFetch<TripMutationResponse>(`/api/trips/${tripId}/archive`, {
        method: "POST",
        body: { actualArrivalAt: new Date().toISOString() },
        idempotencyKey: randomIdempotencyKey(),
      }),
    onMutate: () => markArchivePending(true),
    onSettled: () => markArchivePending(false),
    onSuccess: (res) => {
      applyTripMutationResult(res);
      goToHistoryFromAttachedRoute(navigate, res.trip);
    },
  });

  const trip = tripQuery.data?.trip;
  const currentDuty = findDutyForTrip(runtime.data?.duties ?? [], trip);

  if (!tripId) {
    return (
      <div className="max-w-3xl mx-auto mt-6 px-margin-mobile text-sm text-on-surface-variant">
        交路任务不存在
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-6 px-margin-mobile">
      <section className="bg-surface rounded-xl shadow-sm border border-outline-variant p-md mb-lg">
        <div className="flex justify-between items-start mb-sm">
          <div>
            <h1 className="text-[20px] font-semibold mb-xs">
              当前任务 · {directionLabel(trip?.direction)}单程
            </h1>
            <p className="text-sm text-on-surface-variant font-mono">
              {trip ? `${trip.routeId} · ${trip.trainNo}` : "加载中..."}
            </p>
          </div>
          <div className="bg-surface-container-high text-primary px-sm py-xs rounded text-[12px] font-semibold">
            {tripStatusLabel(trip?.status)}
          </div>
        </div>
        <div className="h-1 bg-surface-variant rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: progressWidth(trip?.status) }}
          />
        </div>
        <div className="flex justify-between mt-xs font-mono text-[12px] text-on-surface-variant">
          <span>始发: {trip?.plannedDepartureAt?.slice(11, 16) ?? "--"}</span>
          <span>预计: {trip?.plannedArrivalAt?.slice(11, 16) ?? "--"}</span>
        </div>
      </section>

      {currentDuty ? (
        <section className="bg-surface rounded-xl shadow-sm border border-outline-variant p-md mb-lg">
          <div className="flex flex-col gap-sm md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-[16px] font-semibold mb-xs">当前值乘</h2>
              <p className="text-sm text-on-surface-variant">
                {currentDuty.operatorName} · {currentDuty.trainNo} ·{" "}
                {currentDuty.routeId ?? "--"}
              </p>
            </div>
            <div className="flex flex-wrap gap-xs">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                {realtimeStatusLabel(currentDuty.status)}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                {locationKindLabel(currentDuty.locationKind)}
              </span>
            </div>
          </div>
          <div className="mt-sm grid gap-sm md:grid-cols-2">
            <InfoCell label="所在位置" value={currentDuty.location} />
            <InfoCell label="上下行" value={directionLabel(currentDuty.direction)} />
            <InfoCell
              label="区间"
              value={formatStationPair(currentDuty)}
            />
            <InfoCell
              label="计划时间"
              value={formatTimeRange(
                currentDuty.plannedDepartureTime,
                currentDuty.plannedArrivalTime,
              )}
            />
            <InfoCell
              label="时刻表来源"
              value={formatScheduleSource(currentDuty)}
              wide
            />
          </div>
        </section>
      ) : null}

      <section className="flex gap-sm mb-lg">
        <button
          disabled={trip?.status !== "PLANNED" || startMutation.isPending}
          onClick={() => startMutation.mutate()}
          className="flex-1 h-touch-target rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50"
        >
          {startMutation.isPending ? "..." : "开始值乘"}
        </button>
        <button
          disabled={trip?.status !== "ACTIVE" || arriveMutation.isPending}
          onClick={() => arriveMutation.mutate()}
          className="flex-1 h-touch-target rounded-lg bg-secondary-container text-on-surface font-semibold disabled:opacity-50"
        >
          {arriveMutation.isPending ? "..." : "标记终到"}
        </button>
        <button
          disabled={trip?.status !== "ARRIVING_TERMINAL" || archivePending}
          onClick={() => archiveMutation.mutate()}
          className="flex-1 h-touch-target rounded-lg bg-secondary text-on-secondary font-semibold disabled:opacity-50"
        >
          {archivePending ? "归档中..." : "归档到历史"}
        </button>
      </section>

      <section className="bg-surface rounded-xl shadow-sm border border-outline-variant p-md">
        <h2 className="text-[16px] font-semibold mb-sm">事件流</h2>
        <ul className="space-y-xs">
          {tripQuery.data?.events.map((e) => (
            <li key={e.id} className="flex items-center gap-sm text-sm">
              <span className="font-mono text-on-surface-variant w-[110px]">
                {e.occurredAt.slice(11, 19)}
              </span>
              <span className="font-semibold">{tripEventKindLabel(e.kind)}</span>
              <span className="text-on-surface-variant">
                {tripStatusLabel(e.fromStatus)} → {tripStatusLabel(e.toStatus)} (
                {tripEventSourceLabel(e.source)})
              </span>
            </li>
          ))}
          {(!tripQuery.data || tripQuery.data.events.length === 0) && (
            <li className="text-sm text-on-surface-variant">暂无事件</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function InfoCell({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-lg bg-surface-container-low p-sm ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="text-[12px] text-on-surface-variant">{label}</div>
      <div className="mt-xs text-sm font-semibold break-words">{value}</div>
    </div>
  );
}

function progressWidth(status: TripTask["status"] | undefined): string {
  switch (status) {
    case "PLANNED":
      return "12%";
    case "ACTIVE":
      return "55%";
    case "ARRIVING_TERMINAL":
      return "88%";
    case "ARCHIVED":
      return "100%";
    default:
      return "20%";
  }
}
