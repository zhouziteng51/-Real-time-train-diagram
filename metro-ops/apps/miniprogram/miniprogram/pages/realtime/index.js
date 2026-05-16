const { apiRequest } = require("../../utils/api");
const { globalRoom } = require("../../utils/rooms");
const { RealtimeSocket } = require("../../utils/ws");
const { statusLabel } = require("../../utils/format");

Page({
  data: {
    trips: [],
    connectionLabel: "离线",
  },
  socket: null,

  async onLoad() {
    await this.refresh();
    this.bindRealtime();
  },

  onUnload() {
    this.socket?.close();
  },

  async refresh() {
    const trips = await apiRequest("/api/trips/active");
    this.setData({
      trips: trips.map((trip) => ({
        ...trip,
        statusLabel: statusLabel(trip.status),
        statusClass: this.statusClassOf(trip.status),
      })),
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
