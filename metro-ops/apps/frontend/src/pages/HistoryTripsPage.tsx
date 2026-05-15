import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { TripTask } from "@metro-ops/shared";
import { apiFetch } from "../api/client.js";
import { useHistoryQueryStore } from "../store/index.js";
import { queryKeyLabel, tripStatusLabel } from "../format/display.js";

const FROM_LABEL: Record<string, string> = {
  "attached-route": "随车交路",
  "master-schedule": "标准时刻表",
  dashboard: "全局总览",
};

export function HistoryTripsPage() {
  const [params] = useSearchParams();
  const hydrate = useHistoryQueryStore((s) => s.hydrateFromUrl);
  const query = useHistoryQueryStore((s) => s.query);
  const from = params.get("from");

  useEffect(() => {
    hydrate(params);
  }, [params, hydrate]);

  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") sp.set(k, String(v));
    }
    return sp.toString();
  }, [query]);

  const history = useQuery({
    queryKey: ["trips", "history", qs],
    queryFn: () => apiFetch<TripTask[]>(`/api/trips/history${qs ? `?${qs}` : ""}`),
  });

  return (
    <div className="max-w-5xl mx-auto p-margin-mobile md:p-lg space-y-md">
      {from && (
        <div className="text-sm text-on-surface-variant">
          来自 <span className="font-semibold text-primary">{FROM_LABEL[from] ?? from}</span>
        </div>
      )}

      <section className="bg-surface rounded-xl border border-outline-variant shadow-sm p-md">
        <h1 className="text-[20px] font-semibold mb-sm">历史车次</h1>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-sm text-[12px]">
          {Object.entries(query).map(([k, v]) => (
            <div key={k} className="flex justify-between font-mono">
              <dt className="text-on-surface-variant">{queryKeyLabel(k)}</dt>
              <dd className="font-semibold">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-surface rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-left text-[12px] uppercase text-on-surface-variant">
            <tr>
              <th className="p-sm">任务</th>
              <th className="p-sm">车次</th>
              <th className="p-sm">交路</th>
              <th className="p-sm">运行图</th>
              <th className="p-sm">计划时间</th>
              <th className="p-sm">实际到达</th>
              <th className="p-sm">状态</th>
            </tr>
          </thead>
          <tbody>
            {(history.data ?? []).map((t) => (
              <tr key={t.id} className="border-t border-outline-variant">
                <td className="p-sm font-mono">{t.id}</td>
                <td className="p-sm font-mono font-bold">{t.trainNo}</td>
                <td className="p-sm font-mono">{t.routeId}</td>
                <td className="p-sm font-mono">{t.scheduleVersionId}</td>
                <td className="p-sm font-mono">{t.plannedDepartureAt.slice(0, 16)}</td>
                <td className="p-sm font-mono">{t.actualArrivalAt?.slice(0, 16) ?? "--"}</td>
                <td className="p-sm">{tripStatusLabel(t.status)}</td>
              </tr>
            ))}
            {(history.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="p-md text-center text-on-surface-variant">
                  没有符合条件的历史车次
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
