const { apiRequest, randomIdempotencyKey } = require("../../utils/api");
const {
  formatImportIssue,
  directionLabel,
  importConfidenceLabel,
  importSourceTypeLabel,
  importStatusLabel,
  dateTimeOf,
  clockOf,
} = require("../../utils/format");
const { onOperatorIdentityChanged } = require("../../utils/operatorIdentity");

Page({
  data: {
    jobId: "",
    job: null,
    preview: null,
    acceptedSections: {
      trains: true,
      segments: true,
      duties: true,
    },
    targetScheduleVersionName: "",
    dutyDate: "",
    loading: true,
    previewLoading: false,
    actionLoading: false,
    errorLabel: "",
    previewErrorLabel: "",
    confirmErrorLabel: "",
  },
  unwatchOperatorIdentity: null,

  async onLoad(query) {
    const jobId = query.id || "";
    if (!jobId) {
      this.setData({ loading: false, errorLabel: "缺少导入任务 ID" });
      return;
    }
    this.setData({ jobId });
    await this.refresh();
    this.unwatchOperatorIdentity = onOperatorIdentityChanged(() =>
      this.refresh(false),
    );
  },

  async onShow() {
    if (this.data.jobId && !this.data.loading) {
      await this.refresh(false);
    }
  },

  onUnload() {
    this.unwatchOperatorIdentity?.();
  },

  async refresh(showLoading = true) {
    if (!this.data.jobId) return;
    if (showLoading) this.setData({ loading: true, errorLabel: "" });

    try {
      const job = await apiRequest(`/api/imports/${this.data.jobId}`);
      this.setData({
        job: this.decorateJob(job),
        loading: false,
        errorLabel: "",
      });
      await this.loadPreview(job.status);
    } catch (error) {
      this.setData({
        loading: false,
        errorLabel: error?.message || "导入任务读取失败",
      });
    }
  },

  async loadPreview(status) {
    if (!["REVIEW_REQUIRED", "NORMALIZED", "IMPORTED"].includes(status)) {
      this.setData({
        preview: null,
        previewLoading: false,
        previewErrorLabel: "",
      });
      return;
    }

    this.setData({ previewLoading: true, previewErrorLabel: "" });
    try {
      const preview = await apiRequest(
        `/api/imports/${this.data.jobId}/preview`,
      );
      this.setData({
        preview: this.decoratePreview(preview),
        previewLoading: false,
      });
    } catch (error) {
      this.setData({
        preview: null,
        previewLoading: false,
        previewErrorLabel: error?.message || "预览读取失败",
      });
    }
  },

  decorateJob(job) {
    return {
      ...job,
      sourceTypeLabel: importSourceTypeLabel(job.sourceType),
      statusLabel: importStatusLabel(job.status),
      createdAtText: dateTimeOf(job.createdAt),
      updatedAtText: dateTimeOf(job.updatedAt),
      confidenceSummary:
        job.confidenceScore !== undefined
          ? `${Math.round(job.confidenceScore * 100)}%`
          : "--",
      confidenceBars: job.confidence
        ? [
            {
              key: "trains",
              label: importConfidenceLabel("trains"),
              ...decorateConfidence(job.confidence.trains),
            },
            {
              key: "segments",
              label: importConfidenceLabel("segments"),
              ...decorateConfidence(job.confidence.segments),
            },
            {
              key: "duties",
              label: importConfidenceLabel("duties"),
              ...decorateConfidence(job.confidence.duties),
            },
          ]
        : [],
      statusClass: statusClassOf(job.status),
      canConfirm: ["REVIEW_REQUIRED", "NORMALIZED"].includes(job.status),
      warningsText: Array.isArray(job.warnings)
        ? job.warnings.map(formatImportIssue)
        : [],
      errorsText: Array.isArray(job.errors)
        ? job.errors.map(formatImportIssue)
        : [],
    };
  },

  decoratePreview(preview) {
    const meta = preview?.meta || {};
    return {
      ...preview,
      meta: {
        ...meta,
        sourceTypeLabel: importSourceTypeLabel(meta.sourceType),
        confidenceSummary: meta.confidence
          ? [
              `车次 ${Math.round(meta.confidence.trains * 100)}%`,
              `交路 ${Math.round(meta.confidence.segments * 100)}%`,
              `值乘 ${Math.round(meta.confidence.duties * 100)}%`,
            ].join(" · ")
          : "",
      },
      confidenceBars: meta.confidence
        ? [
            {
              key: "trains",
              label: importConfidenceLabel("trains"),
              ...decorateConfidence(meta.confidence.trains),
            },
            {
              key: "segments",
              label: importConfidenceLabel("segments"),
              ...decorateConfidence(meta.confidence.segments),
            },
            {
              key: "duties",
              label: importConfidenceLabel("duties"),
              ...decorateConfidence(meta.confidence.duties),
            },
          ]
        : [],
      trains: Array.isArray(preview?.trains) ? preview.trains : [],
      circulationSegments: Array.isArray(preview?.circulationSegments)
        ? preview.circulationSegments
        : [],
      dutyAssignments: Array.isArray(preview?.dutyAssignments)
        ? preview.dutyAssignments
        : [],
      metrics: [
        { label: "车次", value: preview?.trains?.length || 0 },
        { label: "交路", value: preview?.circulationSegments?.length || 0 },
        { label: "值乘", value: preview?.dutyAssignments?.length || 0 },
        { label: "原始块", value: preview?.rawBlocks?.length || 0 },
      ],
      trainsPreview: (preview?.trains || []).slice(0, 6).map(decorateTrain),
      segmentsPreview: (preview?.circulationSegments || [])
        .slice(0, 5)
        .map(decorateSegment),
      dutiesPreview: (preview?.dutyAssignments || [])
        .slice(0, 5)
        .map(decorateDuty),
      warningsText: Array.isArray(preview?.warnings)
        ? preview.warnings.map(formatImportIssue)
        : [],
    };
  },

  onToggleSection(event) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    this.setData({
      acceptedSections: {
        ...this.data.acceptedSections,
        [key]: !this.data.acceptedSections[key],
      },
    });
  },

  onTargetScheduleInput(event) {
    this.setData({ targetScheduleVersionName: event.detail.value });
  },

  onDutyDateInput(event) {
    this.setData({ dutyDate: event.detail.value });
  },

  async confirmImport() {
    if (!this.data.job) return;
    this.setData({ actionLoading: true, confirmErrorLabel: "" });
    try {
      const body = {
        acceptedSections: this.data.acceptedSections,
      };
      if (this.data.targetScheduleVersionName) {
        body.targetScheduleVersionName = this.data.targetScheduleVersionName;
      }
      if (this.data.dutyDate) body.dutyDate = this.data.dutyDate;

      const result = await apiRequest(`/api/imports/${this.data.jobId}/confirm`, {
        method: "POST",
        body,
        idempotencyKey: randomIdempotencyKey(),
      });
      this.setData({
        job: this.decorateJob(result),
        actionLoading: false,
      });
      await this.loadPreview(result.status);
    } catch (error) {
      this.setData({
        actionLoading: false,
        confirmErrorLabel: error?.message || "确认入库失败",
      });
    }
  },
});

function decorateConfidence(value) {
  const pct = Math.round((Number(value) || 0) * 100);
  return {
    percent: pct,
    percentText: `${pct}%`,
    barWidth: `${pct}%`,
    barClass: pct < 60 ? "bar-low" : pct < 85 ? "bar-mid" : "bar-high",
  };
}

function statusClassOf(status) {
  switch (status) {
    case "REVIEW_REQUIRED":
      return "pill-amber";
    case "NORMALIZED":
    case "IMPORTED":
      return "pill-green";
    case "FAILED":
      return "pill-red";
    case "UPLOADED":
    case "PARSING":
      return "pill-primary";
    default:
      return "pill-gray";
  }
}

function decorateTrain(train, index) {
  const stations = Array.isArray(train.stations) ? train.stations : [];
  const first = stations[0];
  const last = stations[stations.length - 1];
  return {
    ...train,
    previewKey: `${train.trainNo || "train"}-${index}`,
    directionText: directionLabel(train.direction),
    stationCount: stations.length,
    stationRange:
      first && last
        ? first.stationName === last.stationName
          ? formatStationStop(first)
          : `${formatStationStop(first)} 至 ${formatStationStop(last)}`
        : "站点时刻未识别",
  };
}

function decorateSegment(segment, index) {
  return {
    ...segment,
    previewKey: `${segment.routeId || "segment"}-${index}`,
    trainCount: Array.isArray(segment.linkedTrainNos)
      ? segment.linkedTrainNos.length
      : 0,
    timeRange:
      [segment.startTime, segment.endTime]
        .filter(Boolean)
        .map(clockOf)
        .join(" - ") || segment.routeId || "--",
  };
}

function decorateDuty(duty, index) {
  return {
    ...duty,
    previewKey: `${duty.operatorName || duty.routeId || duty.trainNo || "duty"}-${index}`,
    title: duty.operatorName || duty.routeId || duty.trainNo || "未命名值乘",
    subtitle: [duty.trainNo, duty.routeId, duty.dutyDate].filter(Boolean).join(" · "),
    notesText: duty.notes || "",
  };
}

function formatStationStop(station) {
  const time = station.departureTime || station.arrivalTime;
  return time ? `${station.stationName} ${clockOf(time)}` : station.stationName;
}
