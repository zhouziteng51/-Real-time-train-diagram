const { apiRequest } = require("../../utils/api");
const {
  importStatusLabel,
  importSourceTypeLabel,
} = require("../../utils/format");
const { onOperatorIdentityChanged } = require("../../utils/operatorIdentity");

Page({
  data: {
    jobs: [],
    loading: true,
    errorLabel: "",
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
    try {
      const jobs = await apiRequest("/api/imports");
      this.setData({
        jobs: this.decorateJobs(Array.isArray(jobs) ? jobs : []),
        loading: false,
        errorLabel: "",
      });
    } catch (error) {
      this.setData({
        jobs: [],
        loading: false,
        errorLabel: error?.message || "导入任务读取失败",
      });
    }
  },

  openJob(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/imports/detail?id=${id}` });
  },

  decorateJobs(jobs) {
    return jobs.map((job) => ({
      ...job,
      sourceTypeLabel: importSourceTypeLabel(job.sourceType),
      statusLabel: importStatusLabel(job.status),
      confidenceText: job.confidence
        ? [
            `车次 ${Math.round(job.confidence.trains * 100)}%`,
            `交路 ${Math.round(job.confidence.segments * 100)}%`,
            `值乘 ${Math.round(job.confidence.duties * 100)}%`,
          ].join(" · ")
        : "",
      confidenceSummary: job.confidenceScore !== undefined
        ? `整体 ${Math.round(job.confidenceScore * 100)}%`
        : "",
    }));
  },
});
