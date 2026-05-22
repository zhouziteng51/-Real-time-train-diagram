const { apiRequest, randomIdempotencyKey } = require("../../utils/api");
const { findDutyForTrip } = require("../../utils/duty");
const { globalRoom, tripRoom } = require("../../utils/rooms");
const { RealtimeSocket } = require("../../utils/ws");
const { onBackendConfigChanged } = require("../../utils/backendConfig");
const { onOperatorIdentityChanged } = require("../../utils/operatorIdentity");
const {
  dateOf,
  directionLabel,
  formatClockRange,
  formatScheduleSource,
  formatStationPair,
  locationKindLabel,
  runtimeStatusLabel,
  statusLabel,
  timeOf,
} = require("../../utils/format");

Page({
  data: {
    tripId: "",
    trip: null,
    currentDuty: null,
    events: [],
    tripStatus: "--",
    statusClass: "pill-gray",
    departureTime: "--",
    arrivalTime: "--",
    directionText: "--",
    progressWidth: "20%",
    runtimeStatusLabel: "--",
    locationKindLabel: "--",
    locationText: "--",
    stationPair: "--",
    dutyTimeRange: "--",
    scheduleSource: "--",
    dutySummaryLabel: "--",
    connectionLabel: "离线",
    actionBusy: false,
    actionBusyType: "",
    startDisabled: true,
    arriveDisabled: true,
    archiveDisabled: true,
    operationHint: "正在读取任务状态",
  },
  socket: null,
  unwatchBackendConfig: null,
  unwatchOperatorIdentity: null,
  subscribedTripId: "",

  async onLoad(query) {
    if (!query.id) return;
    this.setData({ tripId: query.id });
    await this.refresh(query.id);
    this.bindRealtime(query.id);
    this.unwatchBackendConfig = onBackendConfigChanged(() => this.reconnect());
    this.unwatchOperatorIdentity = onOperatorIdentityChanged(() =>
      this.reconnect(),
    );
  },

  onUnload() {
    this.socket?.close();
    this.unwatchBackendConfig?.();
    this.unwatchOperatorIdentity?.();
  },

  async refresh(tripId = this.data.tripId) {
    if (!tripId) return;
    const [detail, runtime] = await Promise.all([
      apiRequest(`/api/trips/${tripId}`),
      apiRequest("/api/runtime/duties").catch(() => null),
    ]);
    const events = detail.events.map((event) => ({
      ...event,
      occurredAtTime: event.occurredAt.slice(11, 19),
      kindLabel: this.eventKindLabel(event.kind),
      fromStatusLabel: statusLabel(event.fromStatus),
      toStatusLabel: statusLabel(event.toStatus),
    }));
    const currentDuty = findDutyForTrip(runtime?.duties || [], detail.trip);
    this.setData({
      trip: detail.trip,
      currentDuty,
      events,
      tripStatus: statusLabel(detail.trip.status),
      statusClass: this.statusClassOf(detail.trip.status),
      departureTime: timeOf(detail.trip.plannedDepartureAt),
      arrivalTime: timeOf(detail.trip.plannedArrivalAt),
      departureDate: dateOf(detail.trip.plannedDepartureAt),
      directionText: directionLabel(detail.trip.direction),
      progressWidth: this.progressWidthOf(detail.trip.status),
      runtimeStatusLabel: runtimeStatusLabel(currentDuty?.status),
      locationKindLabel: locationKindLabel(currentDuty?.locationKind),
      locationText: currentDuty?.location || "未接入实时位置",
      stationPair: formatStationPair(currentDuty),
      dutyTimeRange: currentDuty
        ? formatClockRange(
            currentDuty.plannedDepartureTime,
            currentDuty.plannedArrivalTime,
          )
        : formatClockRange(
            detail.trip.plannedDepartureAt,
            detail.trip.plannedArrivalAt,
          ),
      scheduleSource: formatScheduleSource(currentDuty),
      dutySummaryLabel: currentDuty
        ? `${currentDuty.operatorName} · ${currentDuty.trainNo} · ${currentDuty.routeId || "--"}`
        : "--",
      startDisabled: detail.trip.status !== "PLANNED",
      arriveDisabled: detail.trip.status !== "ACTIVE",
      archiveDisabled: detail.trip.status !== "ARRIVING_TERMINAL",
      operationHint: this.operationHintOf(detail.trip.status),
    });
  },

  bindRealtime(tripId) {
    this.socket?.close();
    const socket = new RealtimeSocket("/ws/network");
    this.socket = socket;
    this.subscribedTripId = tripId;
    socket.onOpen(() => this.setData({ connectionLabel: "在线" }));
    socket.onClose(() => this.setData({ connectionLabel: "离线" }));
    socket.connect();
    socket.subscribe([globalRoom(), tripRoom(tripId)]);
    socket.onMessage((payload) => {
      if (
        payload?.event === "trip.status.changed" &&
        (!payload.tripId || payload.tripId === this.data.tripId)
      ) {
        this.refresh();
      }
    });
    this.setData({ connectionLabel: "连接中" });
  },

  async reconnect() {
    if (!this.data.tripId) return;
    this.socket?.close();
    await this.refresh(this.data.tripId);
    this.bindRealtime(this.data.tripId);
  },

  startTrip() {
    this.runTripAction({
      type: "start",
      enabledStatus: "PLANNED",
      url: `/api/trips/${this.data.tripId}/start`,
      body: {},
      loadingTitle: "正在开始值乘",
      successTitle: "已开始值乘",
      invalidTitle: "当前状态不可开始值乘",
    });
  },

  arriveTerminal() {
    this.confirmTripAction({
      title: "标记终到",
      content: "确认列车已到达终点，进入归档前状态？",
      action: {
        type: "arrive",
        enabledStatus: "ACTIVE",
        url: `/api/trips/${this.data.tripId}/arrive-terminal`,
        body: () => ({
          source: "OPERATOR",
          occurredAt: new Date().toISOString(),
        }),
        loadingTitle: "正在标记终到",
        successTitle: "已标记终到",
        invalidTitle: "当前状态不可标记终到",
      },
    });
  },

  archiveTrip() {
    this.confirmTripAction({
      title: "归档任务",
      content: "确认本次值乘已完成并归档到历史？",
      action: {
        type: "archive",
        enabledStatus: "ARRIVING_TERMINAL",
        url: `/api/trips/${this.data.tripId}/archive`,
        body: () => ({ actualArrivalAt: new Date().toISOString() }),
        loadingTitle: "正在归档",
        successTitle: "已归档到历史",
        invalidTitle: "当前状态不可归档",
      },
    });
  },

  confirmTripAction({ title, content, action }) {
    if (this.data.actionBusy) return;
    wx.showModal({
      title,
      content,
      confirmText: "确认",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) this.runTripAction(action);
      },
    });
  },

  async runTripAction(action) {
    const trip = this.data.trip;
    if (!this.data.tripId || !trip || this.data.actionBusy) return;
    if (trip.status !== action.enabledStatus) {
      wx.showToast({ title: action.invalidTitle, icon: "none" });
      await this.refresh();
      return;
    }

    this.setData({ actionBusy: true, actionBusyType: action.type });
    wx.showLoading({ title: action.loadingTitle, mask: true });
    try {
      await apiRequest(action.url, {
        method: "POST",
        body:
          typeof action.body === "function" ? action.body() : action.body,
        idempotencyKey: randomIdempotencyKey(),
      });
      await this.refresh().catch(() => undefined);
      wx.showToast({ title: action.successTitle, icon: "success" });
    } catch (error) {
      await this.refresh().catch(() => undefined);
      wx.showToast({
        title: error?.message || "操作失败",
        icon: "none",
        duration: 2600,
      });
    } finally {
      wx.hideLoading();
      this.setData({ actionBusy: false, actionBusyType: "" });
    }
  },

  eventKindLabel(kind) {
    switch (kind) {
      case "START":
        return "开始值乘";
      case "DEPART_ORIGIN":
        return "始发发车";
      case "ENTER_TERMINAL_APPROACH":
        return "进入终到区间";
      case "ARRIVE_TERMINAL":
        return "到达终点";
      case "ARCHIVE":
        return "归档";
      case "CANCEL":
        return "取消";
      default:
        return kind || "--";
    }
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

  progressWidthOf(status) {
    switch (status) {
      case "PLANNED":
        return "12%";
      case "ACTIVE":
        return "55%";
      case "ARRIVING_TERMINAL":
        return "88%";
      case "ARCHIVED":
        return "100%";
      default:
        return "20%";
    }
  },

  operationHintOf(status) {
    switch (status) {
      case "PLANNED":
        return "下一步：开始值乘";
      case "ACTIVE":
        return "下一步：标记终到";
      case "ARRIVING_TERMINAL":
        return "下一步：归档到历史";
      case "ARCHIVED":
        return "任务已归档";
      case "CANCELLED":
        return "任务已取消";
      default:
        return "等待任务状态";
    }
  },
});
