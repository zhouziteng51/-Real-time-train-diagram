const { apiRequest, randomIdempotencyKey } = require("../../utils/api");
const {
  buildRuntimeSummary,
  findDutyForTrip,
  loadCurrentDriverTrip,
  loadCurrentOperator,
} = require("../../utils/duty");
const { globalRoom, tripRoom } = require("../../utils/rooms");
const { RealtimeSocket } = require("../../utils/ws");
const {
  dateOf,
  directionLabel,
  dutyLocationHint,
  formatClockRange,
  locationKindLabel,
  runtimeStatusLabel,
  statusLabel,
  timeOf,
} = require("../../utils/format");

Page({
  data: {
    operatorId: "",
    operatorName: "",
    connectionLabel: "离线",
    trip: null,
    currentDuty: null,
    runtimeSummary: {
      timeLabel: "--",
      scheduleLabel: "--",
      scheduleSourceLabel: "--",
    },
    activeTrips: [],
    tripStatus: "--",
    statusClass: "pill-gray",
    runtimeStatus: "--",
    locationKind: "--",
    locationHint: "--",
    locationText: "--",
    directionText: "--",
    dutyTimeRange: "--",
    scheduleSource: "--",
    departureTime: "--",
    arrivalTime: "--",
    loading: false,
  },
  socket: null,
  subscribedTripId: "",

  async onLoad() {
    const operator = await loadCurrentOperator();
    this.setData({
      operatorId: operator.operatorId,
      operatorName: operator.operatorName,
    });

    await this.refreshDriverTask(operator);
    this.bindRealtime();
  },

  onUnload() {
    this.socket?.close();
  },

  async refreshDriverTask(operator = this.currentOperator()) {
    const result = await loadCurrentDriverTrip(operator);
    const activeTrips = this.orderTripsForDriver(
      result.activeTrips,
      result.currentTrip,
    ).map((trip) => this.decorateTrip(trip, result.currentDuty));
    const runtimeSummary = buildRuntimeSummary(result.runtime);
    this.setData({
      activeTrips,
      currentDuty: result.currentDuty,
      runtimeSummary,
    });
    if (result.currentTrip) {
      this.setTrip(result.currentTrip);
      this.setDutySnapshot(result.currentDuty, result.currentTrip);
    } else {
      this.clearTrip();
    }
    return result;
  },

  setTrip(trip) {
    this.setData({
      trip,
      tripStatus: statusLabel(trip.status),
      statusClass: this.statusClassOf(trip.status),
      departureTime: timeOf(trip.plannedDepartureAt),
      arrivalTime: timeOf(trip.plannedArrivalAt),
    });
    this.setDutySnapshot(this.data.currentDuty, trip);
    this.subscribeCurrentTrip();
  },

  clearTrip() {
    this.setData({
      trip: null,
      tripStatus: "--",
      statusClass: "pill-gray",
      runtimeStatus: "--",
      locationKind: "--",
      locationHint: "--",
      locationText: "--",
      directionText: "--",
      dutyTimeRange: "--",
      scheduleSource: "--",
      departureTime: "--",
      arrivalTime: "--",
    });
    this.subscribedTripId = "";
  },

  bindRealtime() {
    const socket = new RealtimeSocket("/ws/network");
    this.socket = socket;
    socket.connect();
    socket.subscribe([globalRoom()]);
    this.subscribeCurrentTrip();
    socket.onMessage((payload) => {
      if (payload?.event === "trip.status.changed") {
        if (payload.tripId === this.data.trip?.id) {
          this.refreshTrip(payload.tripId);
        }
        this.refreshDriverTask();
      }
    });
    this.setData({ connectionLabel: "在线" });
  },

  subscribeCurrentTrip() {
    const tripId = this.data.trip?.id;
    if (!this.socket || !tripId || tripId === this.subscribedTripId) return;
    this.socket.subscribe([tripRoom(tripId)]);
    this.subscribedTripId = tripId;
  },

  async refreshTrip(tripId) {
    const detail = await apiRequest(`/api/trips/${tripId}`);
    this.setTrip(detail.trip);
  },

  async handleStart() {
    if (!this.data.trip) return;
    await this.mutateTrip(`/api/trips/${this.data.trip.id}/start`, {});
  },

  async handleArrive() {
    if (!this.data.trip) return;
    await this.mutateTrip(`/api/trips/${this.data.trip.id}/arrive-terminal`, {
      source: "OPERATOR",
      occurredAt: new Date().toISOString(),
    });
  },

  async handleArchive() {
    if (!this.data.trip) return;
    await this.mutateTrip(`/api/trips/${this.data.trip.id}/archive`, {
      actualArrivalAt: new Date().toISOString(),
    });
  },

  async mutateTrip(url, body) {
    this.setData({ loading: true });
    try {
      const res = await apiRequest(url, {
        method: "POST",
        body,
        header: {
          "Idempotency-Key": randomIdempotencyKey(),
        },
      });
      this.setTrip(res.trip);
      await this.refreshDriverTask();
    } finally {
      this.setData({ loading: false });
    }
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

  decorateTrip(trip, currentDuty) {
    const duty = this.dutyForTrip(trip, currentDuty);
    return {
      ...trip,
      statusLabel: statusLabel(trip.status),
      statusClass: this.statusClassOf(trip.status),
      departureDate: dateOf(trip.plannedDepartureAt),
      isCurrentDriverTrip: duty !== null,
      duty,
      dutyLocation: duty?.location || "",
      dutyLocationKind: locationKindLabel(duty?.locationKind),
      dutyStatusLabel: runtimeStatusLabel(duty?.status),
      dutyTimeRange: duty
        ? formatClockRange(duty.plannedDepartureTime, duty.plannedArrivalTime)
        : formatClockRange(trip.plannedDepartureAt, trip.plannedArrivalAt),
      directionText: directionLabel(duty?.direction || trip.direction),
    };
  },

  dutyForTrip(trip, currentDuty) {
    if (!currentDuty) return null;
    return findDutyForTrip([currentDuty], trip);
  },

  setDutySnapshot(duty, trip) {
    if (duty && trip && !this.dutyForTrip(trip, duty)) duty = null;
    this.setData({
      runtimeStatus: runtimeStatusLabel(duty?.status),
      locationKind: locationKindLabel(duty?.locationKind),
      locationHint: dutyLocationHint(duty),
      locationText: duty?.location || "未接入实时位置",
      directionText: directionLabel(duty?.direction || trip?.direction),
      dutyTimeRange: duty
        ? formatClockRange(duty.plannedDepartureTime, duty.plannedArrivalTime)
        : formatClockRange(trip?.plannedDepartureAt, trip?.plannedArrivalAt),
      scheduleSource: this.scheduleSourceLabel(duty, trip),
    });
  },

  scheduleSourceLabel(duty, trip) {
    if (duty?.scheduleVersionName) {
      return `${duty.scheduleVersionName}（${duty.scheduleVersionId}）`;
    }
    return duty?.scheduleVersionId || trip?.scheduleVersionId || "--";
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
