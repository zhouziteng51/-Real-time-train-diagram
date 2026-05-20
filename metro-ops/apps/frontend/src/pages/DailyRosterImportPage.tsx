import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImportJob, NormalizedImportDocument } from "@metro-ops/shared";
import {
  apiFetch,
  defaultAuthHeaders,
  randomIdempotencyKey,
} from "../api/client.js";
import { apiUrl } from "../api/config.js";
import { demoUploadImportFile, shouldUseDemoApi } from "../api/demoApi.js";
import { importStatusLabel } from "../format/display.js";

interface CurrentDutiesResponse {
  currentTime: {
    localDate: string;
    localTime: string;
  };
  activeSchedule: {
    scheduleVersionId: string;
    label: string;
  };
}

interface DutyPreviewRow {
  shiftName: string;
  routeNo: string;
  operatorName: string;
  trainNos: string[];
  reportTime: string;
  offTime: string;
}

export function DailyRosterImportPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const [activeJobId, setActiveJobId] = useState<string | undefined>();
  const [effectiveDate, setEffectiveDate] = useState("");

  const runtime = useQuery({
    queryKey: ["runtime", "duties"],
    queryFn: () => apiFetch<CurrentDutiesResponse>("/api/runtime/duties"),
    refetchInterval: 1000,
  });

  useEffect(() => {
    if (!effectiveDate && runtime.data?.currentTime.localDate) {
      setEffectiveDate(runtime.data.currentTime.localDate);
    }
  }, [effectiveDate, runtime.data?.currentTime.localDate]);

  const targetScheduleVersionName = useMemo(
    () => operatingScheduleForDate(effectiveDate),
    [effectiveDate],
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (shouldUseDemoApi()) return demoUploadImportFile(file);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/imports"), {
        method: "POST",
        body: form,
        headers: defaultAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as ImportJob;
    },
    onSuccess: (job) => {
      setActiveJobId(job.id);
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
  });

  const job = useQuery({
    queryKey: ["imports", activeJobId],
    queryFn: () => apiFetch<ImportJob>(`/api/imports/${activeJobId}`),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "UPLOADED" || status === "PARSING" ? 1000 : false;
    },
  });

  const preview = useQuery({
    queryKey: ["imports", activeJobId, "preview"],
    queryFn: () =>
      apiFetch<NormalizedImportDocument>(`/api/imports/${activeJobId}/preview`),
    enabled:
      !!activeJobId &&
      !!job.data &&
      ["REVIEW_REQUIRED", "NORMALIZED", "IMPORTED"].includes(job.data.status),
  });

  const confirmMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<ImportJob>(`/api/imports/${jobId}/confirm`, {
        method: "POST",
        idempotencyKey: randomIdempotencyKey(),
        headers: defaultAuthHeaders("ADMIN"),
        body: {
          acceptedSections: {
            trains: false,
            segments: false,
            duties: true,
          },
          targetScheduleVersionName,
          dutyDate: effectiveDate,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["runtime", "duties"] });
      qc.invalidateQueries({ queryKey: ["trips", "active"] });
      qc.invalidateQueries({ queryKey: ["trips", "history"] });
      if (activeJobId) {
        qc.invalidateQueries({ queryKey: ["imports", activeJobId] });
      }
    },
  });

  const previewRows = useMemo(
    () =>
      (preview.data?.dutyAssignments ?? []).map((duty) =>
        dutyPreviewRow(duty),
      ),
    [preview.data?.dutyAssignments],
  );
  const summary = useMemo(() => buildSummary(previewRows), [previewRows]);

  const canConfirm =
    !!job.data &&
    !!effectiveDate &&
    !!targetScheduleVersionName &&
    ["REVIEW_REQUIRED", "NORMALIZED"].includes(job.data.status);

  return (
    <div className="max-w-6xl mx-auto p-margin-mobile md:p-lg space-y-md">
      <section className="bg-surface rounded-xl border border-outline-variant shadow-sm p-md">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-md">
          <div>
            <p className="text-[12px] text-on-surface-variant">
              每天上传一次公司排班表，系统按日期自动挂到 G6001 / Z6001。
            </p>
            <h1 className="text-[22px] font-semibold mt-xs">
              每日排班导入
            </h1>
          </div>
          <div className="rounded-lg bg-surface-container-low px-sm py-xs text-[12px] text-on-surface-variant">
            当前时刻：
            {runtime.data
              ? `${runtime.data.currentTime.localDate} ${runtime.data.currentTime.localTime}`
              : "--"}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-sm mt-md">
          <label className="rounded-lg border border-outline-variant p-sm">
            <div className="text-[12px] text-on-surface-variant mb-xs">
              生效日期
            </div>
            <input
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              className="w-full bg-transparent text-[16px] font-mono outline-none"
            />
          </label>
          <div className="rounded-lg border border-outline-variant p-sm">
            <div className="text-[12px] text-on-surface-variant mb-xs">
              自动匹配时刻表
            </div>
            <div className="font-semibold">
              {targetScheduleVersionName === "G6001"
                ? "工作日 G6001"
                : "周末 Z6001"}
            </div>
          </div>
          <div className="rounded-lg border border-outline-variant p-sm">
            <div className="text-[12px] text-on-surface-variant mb-xs">
              支持班次
            </div>
            <div className="font-semibold">早班 / 白班 / 夜班</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-md">
        <div className="bg-surface rounded-xl border border-outline-variant shadow-sm p-md">
          <div className="flex items-center justify-between gap-sm mb-sm">
            <h2 className="text-[18px] font-semibold">上传排班表</h2>
            {job.data && (
              <span className="px-2 py-0.5 rounded-full bg-surface-container-low text-[12px]">
                {importStatusLabel(job.data.status)}
              </span>
            )}
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full min-h-[112px] rounded-xl border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-xs hover:border-primary hover:bg-primary/5"
          >
            <span className="material-symbols-outlined text-primary text-[30px]">
              upload_file
            </span>
            <span className="font-semibold">
              {uploadMutation.isPending
                ? "上传中..."
                : "选择早 / 白 / 夜排班 Excel"}
            </span>
            <span className="text-[12px] text-on-surface-variant">
              一个工作簿可放三个班，也可以按班次分开导入
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              event.target.value = "";
            }}
          />

          {(uploadMutation.isError || job.isError || preview.isError) && (
            <div className="mt-sm rounded-lg bg-red-50 text-red-700 p-sm text-sm">
              导入失败：
              {uploadMutation.error?.message ??
                job.error?.message ??
                preview.error?.message}
            </div>
          )}

          {job.data && (
            <div className="mt-sm text-[12px] text-on-surface-variant font-mono">
              文件：{job.data.fileName}
            </div>
          )}

          {preview.data && (
            <div className="mt-md">
              <div className="grid grid-cols-3 gap-sm mb-md">
                <PreviewMetric label="排班行" value={summary.routeCount} />
                <PreviewMetric label="人员数" value={summary.operatorCount} />
                <PreviewMetric label="关联车次" value={summary.trainCount} />
              </div>

              <div className="overflow-x-auto rounded-lg border border-outline-variant">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-low text-left text-[12px] text-on-surface-variant">
                    <tr>
                      <th className="p-sm">班次</th>
                      <th className="p-sm">交路</th>
                      <th className="p-sm">姓名</th>
                      <th className="p-sm">车次链</th>
                      <th className="p-sm">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 12).map((row, index) => (
                      <tr
                        key={`${row.shiftName}-${row.routeNo}-${row.operatorName}-${index}`}
                        className="border-t border-outline-variant"
                      >
                        <td className="p-sm">{row.shiftName}</td>
                        <td className="p-sm font-mono">{row.routeNo}</td>
                        <td className="p-sm font-semibold">
                          {row.operatorName}
                        </td>
                        <td className="p-sm font-mono">
                          {row.trainNos.slice(0, 4).join(" / ") || "--"}
                        </td>
                        <td className="p-sm text-on-surface-variant">
                          {[row.reportTime, row.offTime]
                            .filter(Boolean)
                            .join(" - ") || "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            disabled={!canConfirm || confirmMutation.isPending}
            onClick={() => activeJobId && confirmMutation.mutate(activeJobId)}
            className="mt-md w-full h-touch-target rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50"
          >
            {confirmMutation.isPending
              ? "写入排班中..."
              : `确认导入到 ${effectiveDate || "--"} ${targetScheduleVersionName}`}
          </button>
        </div>

        <aside className="bg-surface rounded-xl border border-outline-variant shadow-sm p-md h-fit">
          <h2 className="text-[18px] font-semibold mb-sm">班次覆盖情况</h2>
          <div className="space-y-sm">
            {["早班", "白班", "夜班"].map((shiftName) => (
              <ShiftSummary
                key={shiftName}
                shiftName={shiftName}
                count={summary.shifts[shiftName] ?? 0}
              />
            ))}
          </div>
          <div className="mt-md text-[12px] text-on-surface-variant leading-6">
            同一天同一班次重复导入会覆盖旧分配；其它班次保留。首页只会读取当前日期对应的排班。
          </div>
        </aside>
      </section>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-sm">
      <div className="text-[11px] text-on-surface-variant">{label}</div>
      <div className="font-mono text-[20px] font-semibold">{value}</div>
    </div>
  );
}

function ShiftSummary({
  shiftName,
  count,
}: {
  shiftName: string;
  count: number;
}) {
  return (
    <div className="rounded-lg bg-surface-container-low p-sm flex justify-between items-center">
      <span className="font-semibold">{shiftName}</span>
      <span className="font-mono text-[18px]">{count}</span>
    </div>
  );
}

function buildSummary(rows: DutyPreviewRow[]): {
  routeCount: number;
  operatorCount: number;
  trainCount: number;
  shifts: Record<string, number>;
} {
  const operators = new Set(rows.map((row) => row.operatorName));
  const trains = new Set(rows.flatMap((row) => row.trainNos));
  const shifts: Record<string, number> = {};
  for (const row of rows) {
    shifts[row.shiftName] = (shifts[row.shiftName] ?? 0) + 1;
  }
  return {
    routeCount: rows.length,
    operatorCount: operators.size,
    trainCount: trains.size,
    shifts,
  };
}

function dutyPreviewRow(
  duty: NormalizedImportDocument["dutyAssignments"][number],
): DutyPreviewRow {
  const notes = duty.notes ?? "";
  return {
    shiftName: noteValue(notes, "班次") ?? "未分班",
    routeNo: noteValue(notes, "交路号") ?? duty.routeId ?? "--",
    operatorName: duty.operatorName ?? "未填姓名",
    trainNos: extractTrainNos(notes || duty.trainNo),
    reportTime: noteValue(notes, "出勤时间") ?? "",
    offTime: noteValue(notes, "退勤时间") ?? "",
  };
}

function noteValue(notes: string, key: string): string | undefined {
  return notes.match(new RegExp(`${key}:([^；]+)`))?.[1];
}

function extractTrainNos(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(new Set(value.match(/\d{5}/g) ?? []));
}

function operatingScheduleForDate(date: string): "G6001" | "Z6001" {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "G6001";
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6 ? "Z6001" : "G6001";
}
