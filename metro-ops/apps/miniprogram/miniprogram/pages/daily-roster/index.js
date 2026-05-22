const { apiRequest } = require("../../utils/api");
const { buildRuntimeSummary } = require("../../utils/duty");

Page({
  data: {
    runtimeSummary: {
      timeLabel: "--",
      scheduleLabel: "--",
      scheduleSourceLabel: "--",
    },
    summaryRows: [],
    loading: true,
  },

  async onLoad() {
    await this.refresh();
  },

  async refresh() {
    const runtime = await apiRequest("/api/runtime/duties").catch(() => null);
    const duties = Array.isArray(runtime?.duties) ? runtime.duties : [];
    const shifts = {};
    for (const duty of duties) {
      const key = duty.dutyShiftName || "未分班";
      shifts[key] = (shifts[key] || 0) + 1;
    }
    this.setData({
      runtimeSummary: buildRuntimeSummary(runtime),
      summaryRows: Object.entries(shifts).map(([shift, count]) => ({
        shift,
        count,
      })),
      loading: false,
    });
  },
});
