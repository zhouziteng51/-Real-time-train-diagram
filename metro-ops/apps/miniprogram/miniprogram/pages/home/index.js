const { apiRequest, randomIdempotencyKey } = require("../../utils/api");
const { globalRoom, tripRoom } = require("../../utils/rooms");
const { RealtimeSocket } = require("../../utils/ws");
const { dateOf, statusLabel, timeOf } = require("../../utils/format");

Page({
  data: {
    operatorId: "",
    operatorName: "",
    connectionLabel: "离线",
    trip: null,
    activeTrips: [],
    tripStatus: "--",
    statusClass: "pill-gray",
    departureTime: "--",
    arrivalTime: "--",
    loading: false,
  },
  socket: null,

  async onLoad() {
    const operator = await apiRequest("/api/operators/me");
    this.setData({
      operatorId: operator.operatorId,
      operatorName: operator.operatorName,
    });

    const trips = await this.refreshActiveTrips();
    await this.pickTrip(trips);
    this.bindRealtime();
  },

  onUnload() {
    this.socket?.close();
  },

  async refreshActiveTrips() {
    const trips = await apiRequest("/api/trips/active");
    const activeTrips = trips.map((trip) => this.decorateTrip(trip));
    this.setData({ activeTrips });
    return activeTrips;
  },

  async pickTrip(trips) {
    const trip = trips[0];
    if (!trip) return;
    const detail = await apiRequest(`/api/trips/${trip.id}`);
    this.setTrip(detail.trip);
  },

  setTrip(trip) {
    this.setData({
      trip,
      tripStatus: statusLabel(trip.status),
      statusClass: this.statusClassOf(trip.status),
      departureTime: timeOf(trip.plannedDepartureAt),
      arrivalTime: timeOf(trip.plannedArrivalAt),
    });
  },

  bindRealtime() {
    const socket = new RealtimeSocket("/ws/network");
    this.socket = socket;
    socket.connect();
    socket.subscribe([globalRoom()]);
    const currentTrip = this.data.trip;
    if (currentTrip) socket.subscribe([tripRoom(currentTrip.id)]);
    socket.onMessage((payload) => {
      if (payload?.event === "trip.status.changed") {
        if (payload.tripId === this.data.trip?.id) {
          this.refreshTrip(payload.tripId);
        }
        this.refreshActiveTrips();
      }
    });
    this.setData({ connectionLabel: "在线" });
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
      await this.refreshActiveTrips();
    } finally {
      this.setData({ loading: false });
    }
  },

  decorateTrip(trip) {
    return {
      ...trip,
      statusLabel: statusLabel(trip.status),
      statusClass: this.statusClassOf(trip.status),
      departureDate: dateOf(trip.plannedDepartureAt),
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
