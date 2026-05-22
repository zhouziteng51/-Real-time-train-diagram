const {
  backendPresets,
  readBackendConfig,
  resetBackendConfig,
  saveBackendConfig,
} = require("../../utils/backendConfig");

Page({
  data: {
    apiBaseUrl: "",
    wsBaseUrl: "",
    activeLabel: "",
    presets: [],
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    this.applyToPage(readBackendConfig());
  },

  selectPreset(event) {
    const index = Number(event.currentTarget.dataset.index);
    const preset = backendPresets()[index];
    if (!preset) return;
    this.applyToPage(preset);
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: event.detail.value });
  },

  save() {
    const { apiBaseUrl, wsBaseUrl } = this.data;
    const error = validateConfig(apiBaseUrl, wsBaseUrl);
    if (error) {
      wx.showToast({ title: error, icon: "none" });
      return;
    }
    const config = saveBackendConfig({ apiBaseUrl, wsBaseUrl });
    this.applyToPage(config);
    wx.showToast({ title: "已切换后端", icon: "success" });
  },

  reset() {
    const config = resetBackendConfig();
    this.applyToPage(config);
    wx.showToast({ title: "已恢复默认", icon: "success" });
  },

  applyToPage(config) {
    const presets = backendPresets().map((preset) => ({
      ...preset,
      active: sameConfig(preset, config),
    }));
    const activePreset = presets.find((preset) => preset.active);
    this.setData({
      apiBaseUrl: config.apiBaseUrl,
      wsBaseUrl: config.wsBaseUrl,
      activeLabel: activePreset ? activePreset.title : "自定义",
      presets,
    });
  },
});

function validateConfig(apiBaseUrl, wsBaseUrl) {
  if (!/^https?:\/\/[^/]+/.test(apiBaseUrl)) return "API 地址需以 http(s):// 开头";
  if (!/^wss?:\/\/[^/]+/.test(wsBaseUrl)) return "WS 地址需以 ws(s):// 开头";
  return "";
}

function sameConfig(left, right) {
  return (
    trimTrailingSlash(left.apiBaseUrl) === trimTrailingSlash(right.apiBaseUrl) &&
    trimTrailingSlash(left.wsBaseUrl) === trimTrailingSlash(right.wsBaseUrl)
  );
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
