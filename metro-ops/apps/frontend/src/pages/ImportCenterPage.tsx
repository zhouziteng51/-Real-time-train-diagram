import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { ImportJob, NormalizedImportDocument } from "@metro-ops/shared";
import {
  apiFetch,
  defaultAuthHeaders,
  randomIdempotencyKey,
} from "../api/client.js";
import { apiUrl } from "../api/config.js";
import { demoUploadImportFile, shouldUseDemoApi } from "../api/demoApi.js";
import { useImportStore } from "../store/index.js";
import {
  confidenceLabel,
  importSourceTypeLabel,
  importStatusLabel,
} from "../format/display.js";

export function ImportCenterPage() {
  const navigate = useNavigate();
  const { jobId: routeJobId } = useParams();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingJob, setPendingJob] = useState<ImportJob | null>(null);
  const [reparsingJobId, setReparsingJobId] = useState<string | null>(null);
  const jobsFromWs = useImportStore((s) => s.jobsById);
  const setCurrentJob = useImportStore((s) => s.setCurrentJob);

  const listQuery = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiFetch<ImportJob[]>("/api/imports"),
    refetchInterval: 3000,
  });

  const activeJobId = routeJobId ?? pendingJob?.id ?? listQuery.data?.[0]?.id;
  const jobDetail = useQuery({
    queryKey: ["imports", activeJobId],
    queryFn: () => apiFetch<ImportJob>(`/api/imports/${activeJobId}`),
    enabled: !!activeJobId,
    refetchInterval: 2000,
  });
  const preview = useQuery({
    queryKey: ["imports", activeJobId, "preview"],
    queryFn: () =>
      apiFetch<NormalizedImportDocument>(
        `/api/imports/${activeJobId}/preview`,
      ).catch(() => null),
    enabled:
      !!activeJobId &&
      jobDetail.data !== undefined &&
      ["REVIEW_REQUIRED", "NORMALIZED", "IMPORTED"].includes(
        jobDetail.data.status,
      ),
  });

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
      setPendingJob(job);
      qc.invalidateQueries({ queryKey: ["imports"] });
      navigate(`/imports/${job.id}`);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<ImportJob>(`/api/imports/${id}/confirm`, {
        method: "POST",
        body: {},
        idempotencyKey: randomIdempotencyKey(),
        headers: defaultAuthHeaders("ADMIN"),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imports"] });
      if (activeJobId)
        qc.invalidateQueries({ queryKey: ["imports", activeJobId] });
      qc.invalidateQueries({ queryKey: ["runtime", "duties"] });
      qc.invalidateQueries({ queryKey: ["trips", "active"] });
      qc.invalidateQueries({ queryKey: ["trips", "history"] });
    },
  });

  const reparseMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ status: string }>(`/api/imports/${id}/reparse`, {
        method: "POST",
      }),
    onMutate: async (id) => {
      setReparsingJobId(id);
      await Promise.all([
        qc.cancelQueries({ queryKey: ["imports", id] }),
        qc.cancelQueries({ queryKey: ["imports"] }),
      ]);

      const previousJob = qc.getQueryData<ImportJob>(["imports", id]);
      const previousJobs = qc.getQueryData<ImportJob[]>(["imports"]);
      const updatedAt = new Date().toISOString();

      qc.setQueryData<ImportJob>(["imports", id], (current) =>
        current ? { ...current, status: "PARSING", updatedAt } : current,
      );
      qc.setQueryData<ImportJob[]>(["imports"], (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, status: "PARSING", updatedAt } : item,
        ),
      );

      return { previousJob, previousJobs };
    },
    onError: (_error, id, context) => {
      if (context?.previousJob) {
        qc.setQueryData(["imports", id], context.previousJob);
      }
      if (context?.previousJobs) {
        qc.setQueryData(["imports"], context.previousJobs);
      }
    },
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["imports", id] });
      qc.invalidateQueries({ queryKey: ["imports", id, "preview"] });
    },
    onSettled: (_result, _error, id) => {
      setReparsingJobId((current) => (current === id ? null : current));
    },
  });

  const job =
    jobDetail.data ?? (activeJobId ? jobsFromWs[activeJobId] : undefined);
  const canConfirm =
    !!job && ["REVIEW_REQUIRED", "NORMALIZED"].includes(job.status);
  const canReparse =
    !!job && ["FAILED", "REVIEW_REQUIRED"].includes(job.status);
  const isReparsingThisJob = !!job && reparsingJobId === job.id;
  const visiblePreview =
    job && ["REVIEW_REQUIRED", "NORMALIZED", "IMPORTED"].includes(job.status)
      ? preview.data
      : null;
  const operationError =
    uploadMutation.error ??
    reparseMutation.error ??
    confirmMutation.error ??
    jobDetail.error;

  useEffect(() => {
    setCurrentJob(activeJobId);
    return () => setCurrentJob(undefined);
  }, [activeJobId, setCurrentJob]);

  return (
    <div className="max-w-5xl mx-auto p-margin-mobile md:p-lg space-y-md">
      <section className="bg-surface rounded-xl border border-outline-variant shadow-sm p-md">
        <h1 className="text-[20px] font-semibold mb-sm">导入中心</h1>
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full h-touch-target rounded-lg border-2 border-dashed border-outline-variant flex items-center justify-center gap-sm hover:border-primary"
        >
          <span className="material-symbols-outlined text-primary">
            upload_file
          </span>
          {uploadMutation.isPending
            ? "上传中..."
            : "选择文件（电子表格 / 文档 / PDF）"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadMutation.mutate(f);
            e.target.value = "";
          }}
        />
        {operationError && (
          <div
            role="alert"
            className="mt-sm rounded-lg bg-red-50 p-sm text-sm text-red-700"
          >
            操作失败：{operationError.message}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <div className="md:col-span-1 bg-surface rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <header className="p-sm border-b border-outline-variant font-semibold">
            任务队列
          </header>
          <ul className="divide-y divide-outline-variant">
            {(listQuery.data ?? []).map((j) => (
              <li
                key={j.id}
                className={`p-sm cursor-pointer ${
                  activeJobId === j.id
                    ? "bg-primary/10"
                    : "hover:bg-surface-container-low"
                }`}
                onClick={() => navigate(`/imports/${j.id}`)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[12px]">{j.fileName}</span>
                  <StatusDot status={j.status} />
                </div>
                <div className="text-[11px] text-on-surface-variant font-mono">
                  {importSourceTypeLabel(j.sourceType)} ·{" "}
                  {importStatusLabel(j.status)}
                </div>
              </li>
            ))}
            {(listQuery.data ?? []).length === 0 && (
              <li className="p-sm text-sm text-on-surface-variant">暂无任务</li>
            )}
          </ul>
        </div>

        <div className="md:col-span-2 bg-surface rounded-xl border border-outline-variant shadow-sm p-md">
          {!job && (
            <div className="text-on-surface-variant text-sm">
              选择左侧任务查看详情
            </div>
          )}
          {job && (
            <>
              <header className="mb-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-[18px] font-semibold">
                      {job.fileName}
                    </h2>
                    <p className="text-[12px] text-on-surface-variant font-mono">
                      {importSourceTypeLabel(job.sourceType)} ·{" "}
                      {job.parserName || "等待解析"}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-low text-[12px] font-semibold">
                    {importStatusLabel(job.status)}
                  </span>
                </div>
                {job.confidence && (
                  <div className="grid grid-cols-3 gap-sm mt-sm text-[12px]">
                    <ConfidenceBar
                      label={confidenceLabel("trains")}
                      value={job.confidence.trains}
                    />
                    <ConfidenceBar
                      label={confidenceLabel("segments")}
                      value={job.confidence.segments}
                    />
                    <ConfidenceBar
                      label={confidenceLabel("duties")}
                      value={job.confidence.duties}
                    />
                  </div>
                )}
              </header>

              {["UPLOADED", "PARSING"].includes(job.status) && (
                <div className="mb-sm rounded-lg bg-blue-50 p-sm text-sm text-blue-700">
                  正在解析，页面会自动刷新结果。
                </div>
              )}

              {(job.warnings.length > 0 || job.errors.length > 0) && (
                <section className="mb-sm">
                  {job.errors.map((e, i) => (
                    <div key={`e-${i}`} className="text-[12px] text-error">
                      错误：{formatImportIssue(e)}
                    </div>
                  ))}
                  {job.warnings.map((w, i) => (
                    <div key={`w-${i}`} className="text-[12px] text-amber-600">
                      需复核：{formatImportIssue(w)}
                    </div>
                  ))}
                </section>
              )}

              {visiblePreview && (
                <section className="mb-sm bg-surface-container-low p-sm rounded text-sm">
                  <div className="grid grid-cols-3 gap-sm mb-sm">
                    <PreviewMetric
                      label="车次数"
                      value={visiblePreview.trains.length}
                    />
                    <PreviewMetric
                      label="交路数"
                      value={visiblePreview.circulationSegments.length}
                    />
                    <PreviewMetric
                      label="值乘数"
                      value={visiblePreview.dutyAssignments.length}
                    />
                  </div>
                  <div className="text-[12px] text-on-surface-variant mb-xs">
                    车次预览
                  </div>
                  <ul className="space-y-xs mb-sm">
                    {visiblePreview.trains.slice(0, 5).map((train) => (
                      <li
                        key={train.trainNo}
                        className="rounded bg-surface px-sm py-xs"
                      >
                        <div className="flex items-center justify-between gap-sm">
                          <span className="font-mono font-semibold">
                            {train.trainNo}
                          </span>
                          <span className="text-on-surface-variant">
                            {directionLabel(train.direction)} ·{" "}
                            {train.stations.length} 站
                          </span>
                        </div>
                        <div className="mt-1 text-[12px] text-on-surface-variant">
                          {trainStationRange(train)}
                        </div>
                      </li>
                    ))}
                    {visiblePreview.trains.length === 0 && (
                      <li className="rounded bg-surface px-sm py-xs text-on-surface-variant">
                        未识别到可预览车次
                      </li>
                    )}
                  </ul>
                  <div className="text-[12px] text-on-surface-variant mb-xs">
                    区段预览
                  </div>
                  <ul className="space-y-xs">
                    {visiblePreview.circulationSegments
                      .slice(0, 3)
                      .map((segment) => (
                        <li
                          key={`${segment.routeId}-${segment.fromStationName}-${segment.toStationName}`}
                          className="rounded bg-surface px-sm py-xs"
                        >
                          <div className="flex items-center justify-between gap-sm">
                            <span className="font-semibold">
                              {segment.fromStationName} 至{" "}
                              {segment.toStationName}
                            </span>
                            <span className="text-on-surface-variant">
                              {segment.linkedTrainNos.length} 车次
                            </span>
                          </div>
                          <div className="mt-1 text-[12px] text-on-surface-variant font-mono">
                            {[segment.startTime, segment.endTime]
                              .filter(isDefined)
                              .map(trimSeconds)
                              .join(" - ") || segment.routeId}
                          </div>
                        </li>
                      ))}
                    {visiblePreview.circulationSegments.length === 0 && (
                      <li className="rounded bg-surface px-sm py-xs text-on-surface-variant">
                        未识别到可预览区段
                      </li>
                    )}
                  </ul>
                </section>
              )}

              <footer className="flex flex-col gap-sm sm:flex-row">
                {(canReparse || isReparsingThisJob) && (
                  <button
                    disabled={
                      isReparsingThisJob ||
                      confirmMutation.isPending ||
                      !canReparse
                    }
                    onClick={() => reparseMutation.mutate(job.id)}
                    className="h-touch-target flex-1 rounded-lg border border-outline-variant bg-surface-container-low font-semibold disabled:opacity-50"
                  >
                    {isReparsingThisJob ? "重新解析中..." : "重新解析"}
                  </button>
                )}
                <button
                  disabled={
                    !canConfirm ||
                    confirmMutation.isPending ||
                    reparseMutation.isPending
                  }
                  onClick={() => confirmMutation.mutate(job.id)}
                  className="flex-1 h-touch-target rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50"
                >
                  {confirmMutation.isPending ? "入库中..." : "确认入库"}
                </button>
              </footer>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color: Record<string, string> = {
    UPLOADED: "bg-gray-300",
    PARSING: "bg-blue-400 animate-pulse",
    REVIEW_REQUIRED: "bg-amber-500",
    NORMALIZED: "bg-emerald-400",
    IMPORTED: "bg-emerald-600",
    FAILED: "bg-red-500",
    ARCHIVED: "bg-gray-400",
  };
  return (
    <span
      className={`w-2 h-2 rounded-full ${color[status] ?? "bg-gray-300"}`}
    />
  );
}

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex justify-between mb-xs">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1 bg-surface-variant rounded-full overflow-hidden">
        <div
          className={`h-full ${pct < 60 ? "bg-red-500" : pct < 85 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-surface px-sm py-xs">
      <div className="text-[11px] text-on-surface-variant">{label}</div>
      <div className="font-mono text-[16px] font-semibold">{value}</div>
    </div>
  );
}

type PreviewTrain = NormalizedImportDocument["trains"][number];

function trainStationRange(train: PreviewTrain): string {
  const first = train.stations[0];
  const last = train.stations[train.stations.length - 1];
  if (!first || !last) return "站点时刻未识别";
  if (first.stationName === last.stationName) return formatStationStop(first);
  return `${formatStationStop(first)} 至 ${formatStationStop(last)}`;
}

function formatStationStop(station: PreviewTrain["stations"][number]): string {
  const time = station.departureTime ?? station.arrivalTime;
  return time
    ? `${station.stationName} ${trimSeconds(time)}`
    : station.stationName;
}

function trimSeconds(value: string): string {
  return value.replace(/:00$/, "");
}

function directionLabel(direction: PreviewTrain["direction"]): string {
  if (direction === "UP") return "上行";
  if (direction === "DOWN") return "下行";
  return "方向待核";
}

function formatImportIssue(issue: string): string {
  const stationlessTrain = issue.match(
    /^train:([^:]+):(?:page-\d+:)?no-station-times-detected$/,
  );
  if (stationlessTrain)
    return `车次 ${stationlessTrain[1]} 缺少可定位的站点时刻`;
  if (issue === "train:no-train-nos-detected") return "未识别到车次号";
  if (issue === "segment:no-station-to-station-segments-detected")
    return "已识别车次，但缺少首末站区段";
  if (issue === "document:no-readable-text-extracted")
    return "文档没有可读取的文本层";
  if (/^document:page-\d+:no-readable-text-layer$/.test(issue))
    return "PDF 部分页没有可读取的文本层";
  if (/^train:page-\d+:unable-to-align-train-columns$/.test(issue))
    return "PDF 部分页的车次列与站点行无法稳定对齐";
  if (/^train:\d+-more:no-station-times-detected$/.test(issue))
    return "还有更多车次缺少可定位的站点时刻";
  return issue;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
