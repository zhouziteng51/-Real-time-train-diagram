function timeOf(value) {
  if (!value) return "--";
  return value.slice(11, 16);
}

function clockOf(value) {
  if (!value) return "--";
  if (value.includes("T")) return value.slice(11, 16);
  return value.slice(0, 5);
}

function formatClockRange(start, end) {
  if (!start && !end) return "--";
  return `${clockOf(start)} - ${clockOf(end)}`;
}

function dateOf(value) {
  if (!value) return "--";
  return value.slice(0, 10);
}

function dateTimeOf(value) {
  if (!value) return "--";
  if (value.includes("T")) return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
  return value.slice(0, 16);
}

function statusLabel(status) {
  switch (status) {
    case "PLANNED":
      return "计划中";
    case "ACTIVE":
      return "值乘中";
    case "ARRIVING_TERMINAL":
      return "即将终到";
    case "ARCHIVED":
      return "已归档";
    case "CANCELLED":
      return "已取消";
    default:
      return "--";
  }
}

function directionLabel(direction) {
  if (direction === "UP") return "上行";
  if (direction === "DOWN") return "下行";
  return "未知方向";
}

function runtimeStatusLabel(status) {
  switch (status) {
    case "RUNNING":
      return "运行中";
    case "DWELLING":
      return "停站";
    case "STOPPED":
      return "停车";
    default:
      return "--";
  }
}

function realtimeVehicleStatusLabel(status) {
  switch (status) {
    case "RUNNING":
      return "运行中";
    case "DWELLING":
      return "停站";
    case "STOPPED":
      return "停车";
    case "HELD":
      return "扣车";
    case "OFFLINE":
      return "离线";
    case "ARRIVED":
      return "已到达";
    default:
      return "--";
  }
}

function locationKindLabel(kind) {
  switch (kind) {
    case "AT_STATION":
      return "停站";
    case "BETWEEN_STATIONS":
      return "区间运行";
    case "NOT_STARTED":
      return "待发";
    case "FINISHED":
      return "已终到";
    default:
      return "--";
  }
}

function dutyLocationHint(duty) {
  return formatStationPair(duty);
}

function formatStationPair(duty) {
  if (!duty) return "--";
  if (duty.locationKind === "AT_STATION") return "列车正在站内";
  if (duty.previousStationName && duty.nextStationName) {
    return `${duty.previousStationName} → ${duty.nextStationName}`;
  }
  if (duty.nextStationName) return `下一站：${duty.nextStationName}`;
  if (duty.previousStationName) return `上一站：${duty.previousStationName}`;
  return "逐站时刻已接入";
}

function formatDutyRoute(duty) {
  if (!duty) return "--";
  return duty.dutyRouteNo || duty.dutyRouteId || duty.routeId || "--";
}

function formatActiveSchedule(schedule) {
  if (!schedule) return "--";
  const source =
    schedule.source === "IMPORTED"
      ? schedule.sourceFileName || "已确认入库"
      : "无导入兜底";
  return `${schedule.label}（${schedule.scheduleVersionId} · ${source}）`;
}

function importStatusLabel(status) {
  switch (status) {
    case "UPLOADED":
      return "已上传";
    case "PARSING":
      return "解析中";
    case "REVIEW_REQUIRED":
      return "待复核";
    case "NORMALIZED":
      return "已标准化";
    case "IMPORTED":
      return "已入库";
    case "FAILED":
      return "解析失败";
    case "ARCHIVED":
      return "已归档";
    default:
      return status || "--";
  }
}

function importSourceTypeLabel(sourceType) {
  switch (sourceType) {
    case "XLSX":
      return "电子表格";
    case "DOCX":
      return "文档";
    case "PDF":
      return "PDF 时刻表";
    default:
      return sourceType || "--";
  }
}

function importConfidenceLabel(key) {
  switch (key) {
    case "trains":
      return "车次";
    case "segments":
      return "交路";
    case "duties":
      return "值乘";
    default:
      return key || "--";
  }
}

function formatImportIssue(issue) {
  const stationlessTrain = String(issue || "").match(
    /^train:([^:]+):(?:page-\d+:)?no-station-times-detected$/,
  );
  if (stationlessTrain) return `车次 ${stationlessTrain[1]} 缺少可定位的站点时刻`;
  if (issue === "train:no-train-nos-detected") return "未识别到车次号";
  if (issue === "segment:no-station-to-station-segments-detected") {
    return "已识别车次，但缺少首末站区段";
  }
  if (issue === "segment:no-route-segments-detected") return "未识别到交路区段";
  if (issue === "duty:no-duty-rows-detected") return "未识别到值乘排班行";
  if (issue === "document:no-readable-text-extracted") return "文档没有可读取的文本层";
  if (/^document:page-\d+:no-readable-text-layer$/.test(issue)) {
    return "PDF 部分页没有可读取的文本层";
  }
  if (/^train:page-\d+:unable-to-align-train-columns$/.test(issue)) {
    return "PDF 部分页的车次列与站点行无法稳定对齐";
  }
  if (/^train:\d+-more:no-station-times-detected$/.test(issue)) {
    return "还有更多车次缺少可定位的站点时刻";
  }
  return issue || "--";
}

function formatScheduleSource(duty) {
  if (!duty) return "--";
  if (duty.scheduleVersionName) {
    return `${duty.scheduleVersionName}（${duty.scheduleVersionId}）`;
  }
  return duty.scheduleVersionId || "--";
}

const dutyRouteLabel = formatDutyRoute;
const scheduleSourceLabel = formatScheduleSource;

module.exports = {
  timeOf,
  clockOf,
  formatClockRange,
  dateOf,
  dateTimeOf,
  statusLabel,
  directionLabel,
  runtimeStatusLabel,
  realtimeVehicleStatusLabel,
  locationKindLabel,
  dutyLocationHint,
  formatStationPair,
  formatDutyRoute,
  formatActiveSchedule,
  importStatusLabel,
  importSourceTypeLabel,
  importConfidenceLabel,
  formatImportIssue,
  formatScheduleSource,
  dutyRouteLabel,
  scheduleSourceLabel,
};
