const {
  loadCurrentDriverTrip,
  loadCurrentOperator,
} = require("../../utils/duty");
const { onOperatorIdentityChanged } = require("../../utils/operatorIdentity");
const {
  directionLabel,
  formatClockRange,
  statusLabel,
} = require("../../utils/format");

Page({
  data: {
    operatorId: "",
    operatorName: "",
    currentTrip: null,
    trips: [],
    sourceLabel: "--",
    loading: true,
    errorLabel: "",
  },
  unwatchOperatorIdentity: null,

  async onLoad() {
    await this.refresh();
    this.unwatchOperatorIdentity = onOperatorIdentityChanged(() =>
      this.refresh(false),
    );
  },

  async onShow() {
    if (!this.data.loading) await this.refresh(false);
  },

  onUnload() {
    this.unwatchOperatorIdentity?.();
  },

  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true });
    try {
      const operator = await loadCurrentOperator();
      const result = await loadCurrentDriverTrip(operator);
      const trips = this.orderTrips(result.activeTrips, result.currentTrip)
        .map((trip) => this.decorateTrip(trip, result.currentTrip));
      this.setData({
        operatorId: operator.operatorId,
        operatorName: operator.operatorName,
        currentTrip: result.currentTrip,
        trips,
        sourceLabel: this.sourceLabel(result.source),
        errorLabel: "",
        loading: false,
      });
    } catch (error) {
      this.setData({
        errorLabel: error?.message || "交路任务读取失败",
        loading: false,
      });
    }
  },

  openCurrentTrip() {
    if (!this.data.currentTrip?.id) return;
    wx.navigateTo({ url: `/pages/trip/index?id=${this.data.currentTrip.id}` });
  },

  openTrip(event) {
    const tripId = event.currentTarget.dataset.id;
    if (!tripId) return;
    wx.navigateTo({ url: `/pages/trip/index?id=${tripId}` });
  },

  orderTrips(trips, currentTrip) {
    if (!currentTrip) return trips || [];
    return [
      currentTrip,
      ...(trips || []).filter((trip) => trip.id !== currentTrip.id),
    ];
  },

  decorateTrip(trip, currentTrip) {
    return {
      ...trip,
      isCurrent: currentTrip?.id === trip.id,
      statusLabel: statusLabel(trip.status),
      directionText: directionLabel(trip.direction),
      timeRange: formatClockRange(
        trip.plannedDepartureAt,
        trip.plannedArrivalAt,
      ),
      stationPair: `${trip.originStationId} → ${trip.terminalStationId}`,
    };
  },

  sourceLabel(source) {
    switch (source) {
      case "runtime-duty":
        return "当前排班";
      case "active-assignment":
        return "分配任务";
      case "active-fallback":
        return "实时任务兜底";
      default:
        return "暂无匹配";
    }
  },
});
