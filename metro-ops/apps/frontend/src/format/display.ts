import type {
  Direction,
  ImportJobStatus,
  ImportSourceType,
  RealtimeVehicleStatus,
  TripEventKind,
  TripEventSource,
  TripStatus,
} from "@metro-ops/shared";
import { HISTORY_QUERY_LABELS } from "../navigation/historyQuery.js";

export function directionLabel(direction: Direction | undefined): string {
  if (direction === "UP") return "上行";
  if (direction === "DOWN") return "下行";
  return "未知方向";
}

export function tripStatusLabel(status: TripStatus | undefined): string {
  const labels: Record<TripStatus, string> = {
    PLANNED: "计划中",
    ACTIVE: "值乘中",
    ARRIVING_TERMINAL: "即将终到",
    ARCHIVED: "已归档",
    CANCELLED: "已取消",
  };
  return status ? labels[status] : "未知状态";
}

export function tripEventKindLabel(kind: TripEventKind): string {
  const labels: Record<TripEventKind, string> = {
    START: "开始值乘",
    DEPART_ORIGIN: "始发发车",
    ENTER_TERMINAL_APPROACH: "进入终到区间",
    ARRIVE_TERMINAL: "到达终点",
    ARCHIVE: "归档",
    CANCEL: "取消",
  };
  return labels[kind];
}

export function tripEventSourceLabel(source: TripEventSource): string {
  const labels: Record<TripEventSource, string> = {
    REALTIME: "实时系统",
    OPERATOR: "司机操作",
    SYSTEM: "系统",
  };
  return labels[source];
}

export function realtimeStatusLabel(
  status: RealtimeVehicleStatus | undefined,
): string {
  const labels: Record<RealtimeVehicleStatus, string> = {
    RUNNING: "运行中",
    DWELLING: "停站",
    STOPPED: "停车",
    HELD: "扣车",
    OFFLINE: "离线",
    ARRIVED: "已到达",
  };
  return status ? labels[status] : "未知状态";
}

export function locationKindLabel(
  kind: "AT_STATION" | "BETWEEN_STATIONS" | "NOT_STARTED" | "FINISHED",
): string {
  const labels = {
    AT_STATION: "停站",
    BETWEEN_STATIONS: "区间运行",
    NOT_STARTED: "待发",
    FINISHED: "已终到",
  };
  return labels[kind];
}

export function connectionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CONNECTING: "连接中",
    ONLINE: "在线",
    OFFLINE: "离线",
  };
  return labels[status] ?? status;
}

export function importStatusLabel(status: ImportJobStatus | undefined): string {
  const labels: Record<ImportJobStatus, string> = {
    UPLOADED: "已上传",
    PARSING: "解析中",
    REVIEW_REQUIRED: "待复核",
    NORMALIZED: "已标准化",
    IMPORTED: "已入库",
    FAILED: "解析失败",
    ARCHIVED: "已归档",
  };
  return status ? labels[status] : "未知状态";
}

export function importSourceTypeLabel(
  sourceType: ImportSourceType | undefined,
): string {
  const labels: Record<ImportSourceType, string> = {
    XLSX: "电子表格",
    DOCX: "文档",
    PDF: "PDF 时刻表",
  };
  return sourceType ? labels[sourceType] : "未知来源";
}

export function confidenceLabel(key: "trains" | "segments" | "duties"): string {
  const labels = {
    trains: "车次",
    segments: "交路",
    duties: "值乘",
  };
  return labels[key];
}

export function queryKeyLabel(key: string): string {
  if (key in HISTORY_QUERY_LABELS) {
    return HISTORY_QUERY_LABELS[key as keyof typeof HISTORY_QUERY_LABELS];
  }
  return key;
}
