const { apiRequest } = require("../../utils/api");
const { buildRuntimeSummary } = require("../../utils/duty");
const { statusLabel, formatClockRange } = require("../../utils/format");
const { onOperatorIdentityChanged } = require("../../utils/operatorIdentity");

Page({
  data: {
    runtimeSummary: {
      timeLabel: "--",
      scheduleLabel: "--",
      scheduleSourceLabel: "--",
    },
    trips: [],
    loading: true,
  },
  unwatchOperatorIdentity: null,

  async onLoad() {
    await this.refresh();
    this.unwatchOperatorIdentity = onOperatorIdentityChanged(() =>
      this.refresh(),
    );
  },

  onUnload() {
    this.unwatchOperatorIdentity?.();
  },

  async refresh() {
    const runtime = await apiRequest("/api/runtime/duties").catch(() => null);
    const trips = await apiRequest("/api/trips/history?limit=20").catch(() => []);
    this.setData({
      runtimeSummary: buildRuntimeSummary(runtime),
      trips: (Array.isArray(trips) ? trips : []).map((trip) => ({
        ...trip,
        statusLabel: statusLabel(trip.status),
        timeRange: formatClockRange(trip.plannedDepartureAt, trip.plannedArrivalAt),
      })),
      loading: false,
    });
  },
});
