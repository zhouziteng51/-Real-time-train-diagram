function timeOf(value) {
  if (!value) return "--";
  return value.slice(11, 16);
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

module.exports = {
  timeOf,
  dateOf,
  statusLabel,
  directionLabel,
};
