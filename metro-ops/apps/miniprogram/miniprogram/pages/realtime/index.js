const {
  buildRuntimeSummary,
  loadCurrentDriverTrip,
  loadCurrentOperator,
} = require("../../utils/duty");
const { globalRoom } = require("../../utils/rooms");
const { RealtimeSocket } = require("../../utils/ws");
const {
  directionLabel,
  dutyLocationHint,
  dutyRouteLabel,
  formatClockRange,
  locationKindLabel,
  runtimeStatusLabel,
  scheduleSourceLabel,
  statusLabel,
} = require("../../utils/format");

Page({
  data: {
    operatorId: "",
    operatorName: "",
    currentDuty: null,
    runtimeSummary: {
      timeLabel: "--",
      scheduleLabel: "--",
      scheduleSourceLabel: "--",
    },
    trips: [],
    duties: [],
    connectionLabel: "离线",
    runningCount: 0,
    dwellingCount: 0,
    currentDutyStatusLabel: "--",
    currentDutyLocationKind: "--",
    currentDutyLocationHint: "--",
    currentDutyLocationText: "--",
    currentDutyDirectionText: "--",
    currentDutyTimeRange: "--",
  },
  socket: null,

  async onLoad() {
    const operator = await loadCurrentOperator();
    this.setData({
      operatorId: operator.operatorId,
      operatorName: operator.operatorName,
    });
    await this.refresh();
    this.bindRealtime();
  },

  onUnload() {
    this.socket?.close();
  },

  async refresh() {
    const result = await loadCurrentDriverTrip(this.currentOperator());
    const trips = this.orderTripsForDriver(
      result.activeTrips,
      result.currentTrip,
    );
    const runtimeSummary = buildRuntimeSummary(result.runtime);
    const currentDuty = result.currentDuty;
    const duties = this.orderDutiesForDriver(
      result.runtime?.duties || [],
      currentDuty,
    ).map((duty) => this.decorateDuty(duty, currentDuty));
    this.setData({
      currentDuty,
      runtimeSummary,
      duties,
      runningCount: duties.filter((duty) => duty.status === "RUNNING").length,
      dwellingCount: duties.filter((duty) => duty.status === "DWELLING").length,
      currentDutyStatusLabel: runtimeStatusLabel(currentDuty?.status),
      currentDutyLocationKind: locationKindLabel(currentDuty?.locationKind),
      currentDutyLocationHint: dutyLocationHint(currentDuty),
      currentDutyLocationText: currentDuty?.location || "未接入实时位置",
      currentDutyDirectionText: directionLabel(currentDuty?.direction),
      currentDutyTimeRange: currentDuty
        ? formatClockRange(
            currentDuty.plannedDepartureTime,
            currentDuty.plannedArrivalTime,
          )
        : "--",
      trips: trips.map((trip) => {
        return {
          ...trip,
          statusLabel: statusLabel(trip.status),
          statusClass: this.statusClassOf(trip.status),
          isCurrentDriverTrip: trip.id === result.currentTrip?.id,
          dutyTimeRange: formatClockRange(
            trip.plannedDepartureAt,
            trip.plannedArrivalAt,
          ),
          directionText: directionLabel(trip.direction),
        };
      }),
    });
  },

  bindRealtime() {
    const socket = new RealtimeSocket("/ws/network");
    this.socket = socket;
    socket.connect();
    socket.subscribe([globalRoom()]);
    socket.onMessage((payload) => {
      if (payload?.event === "trip.status.changed") {
        this.refresh();
      }
    });
    this.setData({ connectionLabel: "在线" });
  },

  currentOperator() {
    return {
      operatorId: this.data.operatorId,
      operatorName: this.data.operatorName,
    };
  },

  orderTripsForDriver(trips, currentTrip) {
    if (!currentTrip) return trips;
    return [
      currentTrip,
      ...trips.filter((trip) => trip.id !== currentTrip.id),
    ];
  },

  orderDutiesForDriver(duties, currentDuty) {
    if (!currentDuty) return duties;
    return [
      currentDuty,
      ...duties.filter(
        (duty) =>
          duty.operatorId !== currentDuty.operatorId ||
          duty.trainNo !== currentDuty.trainNo,
      ),
    ];
  },

  decorateDuty(duty, currentDuty) {
    return {
      ...duty,
      routeLabel: dutyRouteLabel(duty),
      shiftLabel: duty.dutyShiftName || "未识别班次",
      directionText: directionLabel(duty.direction),
      stationPair: dutyLocationHint(duty),
      runtimeStatusLabel: runtimeStatusLabel(duty.status),
      locationKindLabel: locationKindLabel(duty.locationKind),
      timeRange: formatClockRange(
        duty.plannedDepartureTime,
        duty.plannedArrivalTime,
      ),
      scheduleSource: scheduleSourceLabel(duty),
      isCurrentDriverDuty:
        !!currentDuty &&
        duty.operatorId === currentDuty.operatorId &&
        duty.trainNo === currentDuty.trainNo,
    };
  },

  statusClassOf(status) {
    switch (status) {
      case "ACTIVE":
        return "pill-green";
      case "ARRIVING_TERMINAL":
        return "pill-amber";
      case "ARCHIVED":
        return "pill-gray";
      default:
        return "pill-primary";
    }
  },
});
