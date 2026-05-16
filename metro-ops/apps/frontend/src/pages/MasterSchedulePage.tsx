import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { TripTask } from "@metro-ops/shared";
import { apiFetch } from "../api/client.js";
import { goToHistoryFromMasterSchedule } from "../navigation/toHistory.js";
import { tripStatusLabel } from "../format/display.js";
import { useAppStore } from "../store/index.js";

interface ActiveOperatingSchedule {
  scheduleVersionId: string;
  scheduleVersionName?: string | undefined;
  label: string;
  source: "IMPORTED" | "FALLBACK";
  importedAt?: string | undefined;
  sourceFileName?: string | undefined;
}

interface CurrentDutiesResponse {
  activeSchedule: ActiveOperatingSchedule;
}

export function MasterSchedulePage() {
  const navigate = useNavigate();
  const setActiveScheduleVersion = useAppStore(
    (s) => s.setActiveScheduleVersion,
  );
  const runtime = useQuery({
    queryKey: ["runtime", "duties"],
    queryFn: () => apiFetch<CurrentDutiesResponse>("/api/runtime/duties"),
  });
  const active = useQuery({
    queryKey: ["trips", "active"],
    queryFn: () => apiFetch<TripTask[]>("/api/trips/active"),
  });

  useEffect(() => {
    const versionId =
      runtime.data?.activeSchedule.scheduleVersionId ??
      active.data?.[0]?.scheduleVersionId;
    setActiveScheduleVersion(versionId);
  }, [
    active.data?.[0]?.scheduleVersionId,
    runtime.data?.activeSchedule.scheduleVersionId,
    setActiveScheduleVersion,
  ]);

  return (
    <div className="max-w-4xl mx-auto p-margin-mobile md:p-lg space-y-md">
      <section className="bg-surface rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <header className="px-md py-sm border-b border-outline-variant bg-surface-container-low flex items-center justify-between">
          <h3 className="text-[18px] font-semibold flex items-center gap-xs">
            <span className="material-symbols-outlined text-secondary">route</span>
            标准时刻表 · 图-交路
          </h3>
          <span className="text-[12px] font-mono text-on-surface-variant">
            {active.data?.length ?? 0} 条任务
          </span>
        </header>
        <div className="flex flex-col">
          {(active.data ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() =>
                goToHistoryFromMasterSchedule(navigate, {
                  trainNo: t.trainNo,
                  routeId: t.routeId,
                  scheduleVersionId: t.scheduleVersionId,
                  date: t.plannedDepartureAt.slice(0, 10),
                })
              }
              className="flex flex-col p-md border-b border-outline-variant hover:bg-surface-container-lowest transition-colors text-left relative"
            >
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-secondary" />
              <div className="flex justify-between items-start mb-sm pl-sm">
                <div className="flex items-center gap-sm">
                  <span className="font-mono font-bold">{t.routeId}</span>
                  <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    {tripStatusLabel(t.status)}
                  </span>
                </div>
                <span className="text-[12px] text-on-surface-variant font-mono">
                  {t.plannedDepartureAt.slice(11, 16)} · {t.plannedArrivalAt.slice(11, 16)}
                </span>
              </div>
              <div className="pl-sm flex items-center gap-sm text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-[16px]">subway</span>
                <span>
                  {t.originStationId}
                  <span className="mx-xs material-symbols-outlined text-[14px]">arrow_forward</span>
                  {t.terminalStationId}
                </span>
              </div>
            </button>
          ))}
          {(active.data ?? []).length === 0 && (
            <div className="p-md text-sm text-on-surface-variant">暂无运行中的交路</div>
          )}
        </div>
      </section>
    </div>
  );
}
