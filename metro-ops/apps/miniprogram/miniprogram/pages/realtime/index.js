const { loadCurrentOperator } = require("../../utils/duty");
const { loadRuntimeDashboard } = require("../../utils/runtimeDashboard");
const { globalRoom } = require("../../utils/rooms");
const { RealtimeSocket } = require("../../utils/ws");
const { onBackendConfigChanged } = require("../../utils/backendConfig");
const { onOperatorIdentityChanged } = require("../../utils/operatorIdentity");

Page({
  data: {
    operatorId: "",
    operatorName: "",
    connectionLabel: "离线",
    currentDuty: null,
    runtimeSummary: {
      timeLabel: "--",
      scheduleLabel: "--",
      scheduleSourceLabel: "--",
    },
    duties: [],
    runningCount: 0,
    dwellingCount: 0,
    errorLabel: "",
  },
  socket: null,
  unwatchBackendConfig: null,
  unwatchOperatorIdentity: null,

  async onLoad() {
    await this.refresh();
    this.bindRealtime();
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

  async refresh() {
    try {
      const operator = await loadCurrentOperator();
      this.setData({
        operatorId: operator.operatorId,
        operatorName: operator.operatorName,
      });
      const result = await loadRuntimeDashboard(operator);
      this.setData({
        currentDuty: result.currentDuty,
        runtimeSummary: result.runtimeSummary,
        duties: result.duties,
        runningCount: result.runningCount,
        dwellingCount: result.dwellingCount,
        errorLabel: "",
      });
    } catch (error) {
      this.setData({
        errorLabel: error?.message || "实时数据读取失败",
      });
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
      if (payload?.event === "trip.status.changed") {
        this.refresh();
      }
    });
    this.setData({ connectionLabel: "连接中" });
  },

  async reconnect() {
    this.socket?.close();
    await this.refresh();
    this.bindRealtime();
  },

  currentOperator() {
    return {
      operatorId: this.data.operatorId,
      operatorName: this.data.operatorName,
    };
  },
});
