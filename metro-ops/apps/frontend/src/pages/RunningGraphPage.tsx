import { useMemo } from "react";
import { useRealtimeStore } from "../store/index.js";
import { realtimeStatusLabel } from "../format/display.js";

export function RunningGraphPage() {
  const vehicles = useRealtimeStore((s) => s.vehiclesById);
  const lastSyncAt = useRealtimeStore((s) => s.lastSyncAt);

  const rows = useMemo(
    () =>
      Object.values(vehicles).sort(
        (a, b) =>
          a.trainNo.localeCompare(b.trainNo) ||
          (a.tripId ?? "").localeCompare(b.tripId ?? ""),
      ),
    [vehicles],
  );

  return (
    <div className="p-margin-mobile md:p-lg max-w-7xl mx-auto">
      <section className="bg-surface-container-lowest rounded-lg shadow-sm border border-outline-variant">
        <header className="p-md border-b border-outline-variant flex justify-between items-center">
          <h2 className="text-[18px] font-semibold flex items-center gap-xs">
            <span className="material-symbols-outlined text-secondary">timeline</span>
            运行图
          </h2>
          <span className="text-[12px] font-mono text-on-surface-variant">
            最近同步：{lastSyncAt ?? "--"}
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left text-[12px] uppercase text-on-surface-variant">
              <tr>
                <th className="p-sm">车次</th>
                <th className="p-sm">交路</th>
                <th className="p-sm">状态</th>
                <th className="p-sm">速度</th>
                <th className="p-sm">晚点</th>
                <th className="p-sm">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.vehicleId} className="border-t border-outline-variant">
                  <td className="p-sm">
                    <div className="font-mono font-bold">{v.trainNo}</div>
                    <div className="text-[11px] text-on-surface-variant font-mono">
                      {v.tripId ?? "--"}
                    </div>
                  </td>
                  <td className="p-sm font-mono">{v.routeId}</td>
                  <td className="p-sm">{realtimeStatusLabel(v.status)}</td>
                  <td className="p-sm font-mono">{v.speedKph?.toFixed(0) ?? 0} 公里/小时</td>
                  <td className="p-sm font-mono">
                    {v.delaySeconds ? `${v.delaySeconds} 秒` : "准点"}
                  </td>
                  <td className="p-sm font-mono text-on-surface-variant">{v.updatedAt}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-md text-center text-on-surface-variant text-sm"
                  >
                    暂无实时车位数据
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
