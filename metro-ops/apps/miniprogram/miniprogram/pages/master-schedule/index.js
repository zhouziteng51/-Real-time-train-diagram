const { apiRequest } = require("../../utils/api");
const { formatClockRange, statusLabel } = require("../../utils/format");

Page({
  data: {
    activeScheduleLabel: "--",
    trips: [],
    loading: true,
  },

  async onLoad() {
    await this.refresh();
  },

  async refresh() {
    const [runtime, active] = await Promise.all([
      apiRequest("/api/runtime/duties").catch(() => null),
      apiRequest("/api/trips/active").catch(() => []),
    ]);
    this.setData({
      activeScheduleLabel: runtime?.activeSchedule?.label || "--",
      trips: (Array.isArray(active) ? active : []).map((trip) => ({
        ...trip,
        statusLabel: statusLabel(trip.status),
        timeRange: formatClockRange(trip.plannedDepartureAt, trip.plannedArrivalAt),
      })),
      loading: false,
    });
  },
});
