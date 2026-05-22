const { apiRequest } = require("../../utils/api");
const { globalRoom } = require("../../utils/rooms");
const { decorateVehicle, sortVehicles } = require("../../utils/realtimeVehicles");
const { RealtimeSocket } = require("../../utils/ws");
const { onBackendConfigChanged } = require("../../utils/backendConfig");

Page({
  data: {
    vehicles: [],
    lastSyncAt: "--",
    connectionLabel: "离线",
    errorLabel: "",
  },
  socket: null,
  unwatchBackendConfig: null,

  async onLoad() {
    await this.loadFallbackVehicles();
    this.bindRealtime();
    this.unwatchBackendConfig = onBackendConfigChanged(() => this.reconnect());
  },

  onUnload() {
    this.socket?.close();
    this.unwatchBackendConfig?.();
  },

  async loadFallbackVehicles() {
    try {
      const trips = await apiRequest("/api/trips/active");
      const now = new Date().toISOString();
      const vehicles = (Array.isArray(trips) ? trips : []).map((trip, index) =>
        decorateVehicle({
          vehicleId: trip.assignedVehicleId || `vehicle-${trip.id}`,
          trainNo: trip.trainNo,
          routeId: trip.routeId,
          tripId: trip.id,
          speedKph: trip.status === "ACTIVE" ? 52 + ((index * 7) % 24) : 0,
          delaySeconds: 0,
          status: this.statusForTrip(trip.status),
          updatedAt: now,
        }),
      ).sort(sortVehicles);
      this.setData({
        vehicles,
        lastSyncAt: vehicles.length > 0 ? now : "--",
        errorLabel: "",
      });
    } catch (error) {
      this.setData({ errorLabel: error?.message || "运行图读取失败" });
    }
  },

  bindRealtime() {
    this.socket?.close();
    const socket = new RealtimeSocket("/ws/network");
    this.socket = socket;
    socket.onOpen(() => this.setData({ connectionLabel: "在线" }));
    socket.onClose(() => this.setData({ connectionLabel: "离线" }));
    socket.connect();
    socket.subscribe([globalRoom()]);
    socket.onMessage((payload) => {
      if (payload?.event !== "network.vehicle.updated") return;
      const vehicles = (payload.items || []).map(decorateVehicle).sort(sortVehicles);
      this.setData({
        vehicles,
        lastSyncAt: payload.sentAt || new Date().toISOString(),
        errorLabel: "",
      });
    });
    this.setData({ connectionLabel: "连接中" });
  },

  async reconnect() {
    this.socket?.close();
    await this.loadFallbackVehicles();
    this.bindRealtime();
  },

  statusForTrip(status) {
    switch (status) {
      case "ACTIVE":
        return "RUNNING";
      case "ARRIVING_TERMINAL":
        return "DWELLING";
      case "ARCHIVED":
        return "ARRIVED";
      case "CANCELLED":
        return "OFFLINE";
      default:
        return "STOPPED";
    }
  },
});
