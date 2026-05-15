import { useQuery } from "@tanstack/react-query";
import type { Direction, RealtimeVehicleStatus } from "@metro-ops/shared";
import { apiFetch } from "../api/client.js";
import {
  directionLabel,
  locationKindLabel,
  realtimeStatusLabel,
} from "../format/display.js";

type RuntimeLocationKind =
  | "AT_STATION"
  | "BETWEEN_STATIONS"
  | "NOT_STARTED"
  | "FINISHED";

interface CurrentTimeResponse {
  iso: string;
  timeZone: "Asia/Shanghai";
  localDate: string;
  localTime: string;
}

interface LiveTrainDuty {
  operatorId: string;
  operatorName: string;
  trainNo: string;
  routeId?: string | undefined;
  scheduleVersionName?: string | undefined;
  direction?: Direction | undefined;
  location: string;
  locationKind: RuntimeLocationKind;
  previousStationName?: string | undefined;
  nextStationName?: string | undefined;
  delaySeconds: number;
  status: Extract<RealtimeVehicleStatus, "RUNNING" | "DWELLING" | "STOPPED">;
  plannedDepartureTime?: string | undefined;
  plannedArrivalTime?: string | undefined;
  calculatedAt: string;
}

interface ActiveOperatingSchedule {
  scheduleVersionName: "G6001" | "Z6001";
  label: string;
  calendarType: "WEEKDAY" | "WEEKEND";
}

interface CurrentDutiesResponse {
  currentTime: CurrentTimeResponse;
  activeSchedule: ActiveOperatingSchedule;
  duties: LiveTrainDuty[];
}

export function DashboardPage() {
  const runtime = useQuery({
    queryKey: ["runtime", "duties"],
    queryFn: () => apiFetch<CurrentDutiesResponse>("/api/runtime/duties"),
    refetchInterval: 1000,
  });

  const duties = runtime.data?.duties ?? [];
  const currentTime = runtime.data?.currentTime;
  const activeSchedule = runtime.data?.activeSchedule;
  const runningCount = duties.filter(
    (duty) => duty.status === "RUNNING",
  ).length;
  const dwellingCount = duties.filter(
    (duty) => duty.status === "DWELLING",
  ).length;

  return (
    <div className="p-margin-mobile md:p-lg max-w-7xl mx-auto space-y-md">
      <section className="grid grid-cols-3 gap-sm">
        <MetricCard label="当前值乘" value={duties.length} />
        <MetricCard label="区间运行" value={runningCount} tone="ok" />
        <MetricCard label="停站" value={dwellingCount} />
      </section>

      <section className="bg-surface-container-lowest rounded-lg shadow-sm border border-outline-variant overflow-hidden">
        <header className="p-md border-b border-outline-variant flex flex-col gap-xs md:flex-row md:justify-between md:items-center">
          <h2 className="text-[18px] font-semibold flex items-center gap-xs">
            <span className="material-symbols-outlined text-primary">
              groups
            </span>
            当前人员值乘
          </h2>
          <div className="text-[12px] text-on-surface-variant md:text-right">
            <div className="font-mono">
              当前时间：
              {currentTime
                ? `${currentTime.localDate} ${currentTime.localTime}`
                : "--"}
            </div>
            <div>
              今日执行：
              {activeSchedule
                ? `${activeSchedule.label}（${activeSchedule.scheduleVersionName}）`
                : "--"}
            </div>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left text-[12px] text-on-surface-variant">
              <tr>
                <th className="p-sm">人员</th>
                <th className="p-sm">车次</th>
                <th className="p-sm">上/下行</th>
                <th className="p-sm">所在位置</th>
                <th className="p-sm">实时状态</th>
                <th className="p-sm">计划时间</th>
                <th className="p-sm">时刻表来源</th>
              </tr>
            </thead>
            <tbody>
              {duties.map((duty) => (
                <tr
                  key={`${duty.operatorId}-${duty.trainNo}`}
                  className="border-t border-outline-variant"
                >
                  <td className="p-sm">
                    <div className="font-semibold">{duty.operatorName}</div>
                    <div className="text-[11px] text-on-surface-variant font-mono">
                      {duty.operatorId}
                    </div>
                  </td>
                  <td className="p-sm">
                    <div className="font-mono font-bold">{duty.trainNo}</div>
                    <div className="text-[11px] text-on-surface-variant font-mono">
                      {duty.routeId ?? "--"}
                    </div>
                  </td>
                  <td className="p-sm">{directionLabel(duty.direction)}</td>
                  <td className="p-sm min-w-[180px]">
                    <div className="font-semibold">{duty.location}</div>
                    <div className="text-[11px] text-on-surface-variant">
                      {formatStationPair(duty)}
                    </div>
                  </td>
                  <td className="p-sm">
                    <div className="flex flex-wrap gap-xs">
                      <StatusChip status={duty.status} />
                      <LocationKindChip kind={duty.locationKind} />
                    </div>
                  </td>
                  <td className="p-sm font-mono">
                    {formatTimeRange(
                      duty.plannedDepartureTime,
                      duty.plannedArrivalTime,
                    )}
                  </td>
                  <td className="p-sm text-on-surface-variant">
                    {duty.scheduleVersionName ?? "已导入时刻表"}
                  </td>
                </tr>
              ))}
              {runtime.isError && (
                <tr>
                  <td colSpan={7} className="p-md text-center text-red-700">
                    实时数据读取失败：{runtime.error.message}
                  </td>
                </tr>
              )}
              {!runtime.isError && duties.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-md text-center text-on-surface-variant"
                  >
                    当前时间没有匹配到正在运行的真实车次
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "ok" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700 bg-emerald-50"
      : tone === "warn"
        ? "text-amber-700 bg-amber-50"
        : "text-primary bg-primary/10";
  return (
    <div className="bg-surface rounded-lg border border-outline-variant p-sm">
      <div className="text-[12px] text-on-surface-variant">{label}</div>
      <div
        className={`mt-xs inline-flex px-sm py-xs rounded font-mono text-[20px] ${toneClass}`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: RealtimeVehicleStatus }) {
  const palette: Record<RealtimeVehicleStatus, string> = {
    RUNNING: "bg-emerald-100 text-emerald-700",
    DWELLING: "bg-blue-100 text-blue-700",
    HELD: "bg-amber-100 text-amber-700",
    STOPPED: "bg-red-100 text-red-700",
    OFFLINE: "bg-gray-100 text-gray-700",
    ARRIVED: "bg-purple-100 text-purple-700",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${palette[status]}`}
    >
      {realtimeStatusLabel(status)}
    </span>
  );
}

function LocationKindChip({ kind }: { kind: RuntimeLocationKind }) {
  const palette: Record<RuntimeLocationKind, string> = {
    AT_STATION: "bg-blue-50 text-blue-700",
    BETWEEN_STATIONS: "bg-emerald-50 text-emerald-700",
    NOT_STARTED: "bg-amber-50 text-amber-700",
    FINISHED: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${palette[kind]}`}
    >
      {locationKindLabel(kind)}
    </span>
  );
}

function formatTimeRange(
  start: string | undefined,
  end: string | undefined,
): string {
  if (!start && !end) return "--";
  return `${formatClock(start)} - ${formatClock(end)}`;
}

function formatClock(value: string | undefined): string {
  return value ? value.slice(0, 5) : "--";
}

function formatStationPair(duty: LiveTrainDuty): string {
  if (duty.locationKind === "AT_STATION") return "列车正在站内";
  if (duty.previousStationName && duty.nextStationName) {
    return `${duty.previousStationName} → ${duty.nextStationName}`;
  }
  if (duty.nextStationName) return `下一站：${duty.nextStationName}`;
  if (duty.previousStationName) return `上一站：${duty.previousStationName}`;
  return "逐站时刻已接入";
}
