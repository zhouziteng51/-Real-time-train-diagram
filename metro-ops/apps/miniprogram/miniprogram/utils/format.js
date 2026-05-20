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

function statusLabel(status) {
  switch (status) {
    case "PLANNED":
      return "待发车";
    case "ACTIVE":
      return "运行中";
    case "ARRIVING_TERMINAL":
      return "终到中";
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
  return "--";
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
  if (!duty) return "--";
  if (duty.locationKind === "AT_STATION") return "列车正在站内";
  if (duty.previousStationName && duty.nextStationName) {
    return `${duty.previousStationName} → ${duty.nextStationName}`;
  }
  if (duty.nextStationName) return `下一站：${duty.nextStationName}`;
  if (duty.previousStationName) return `上一站：${duty.previousStationName}`;
  return "逐站时刻已接入";
}

function dutyRouteLabel(duty) {
  if (!duty) return "--";
  return duty.dutyRouteNo || duty.dutyRouteId || duty.routeId || "--";
}

function scheduleSourceLabel(duty) {
  if (!duty) return "--";
  if (duty.scheduleVersionName) {
    return `${duty.scheduleVersionName}（${duty.scheduleVersionId}）`;
  }
  return duty.scheduleVersionId || "--";
}

module.exports = {
  timeOf,
  clockOf,
  formatClockRange,
  dateOf,
  statusLabel,
  directionLabel,
  runtimeStatusLabel,
  locationKindLabel,
  dutyLocationHint,
  dutyRouteLabel,
  scheduleSourceLabel,
};
