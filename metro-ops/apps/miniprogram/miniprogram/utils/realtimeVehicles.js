const { realtimeVehicleStatusLabel } = require("./format");

function decorateVehicle(vehicle) {
  return {
    ...vehicle,
    statusLabel: realtimeVehicleStatusLabel(vehicle.status),
    speedText: typeof vehicle.speedKph === "number"
      ? `${vehicle.speedKph.toFixed(0)} 公里/小时`
      : "0 公里/小时",
    delayText: vehicle.delaySeconds ? `${vehicle.delaySeconds} 秒` : "准点",
    stationText: vehicle.currentStationId || "--",
  };
}

function sortVehicles(left, right) {
  return left.trainNo.localeCompare(right.trainNo) ||
    (left.tripId ?? "").localeCompare(right.tripId ?? "");
}

module.exports = {
  decorateVehicle,
  sortVehicles,
};
