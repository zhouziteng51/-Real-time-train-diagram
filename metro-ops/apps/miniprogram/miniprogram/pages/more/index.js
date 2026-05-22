const {
  identityLabel,
  identityPresets,
  isDefaultOperatorIdentity,
  normalizeRole,
  onOperatorIdentityChanged,
  readOperatorIdentity,
  resetOperatorIdentity,
  saveOperatorIdentity,
} = require("../../utils/operatorIdentity");

Page({
  data: {
    entries: [
      { title: "时刻表", path: "/pages/master-schedule/index", note: "标准时刻表 · 图-交路" },
      { title: "排班", path: "/pages/daily-roster/index", note: "导入排班与值乘" },
      { title: "历史", path: "/pages/history-trips/index", note: "历史车次查询" },
      { title: "导入", path: "/pages/imports/index", note: "导入中心" },
      { title: "后端设置", path: "/pages/backend-settings/index", note: "切换本地 / 局域网 / 远端" },
    ],
    operatorId: "",
    operatorName: "",
    role: "DRIVER",
    identityLabel: "",
    isDefaultIdentity: true,
    presets: [],
    roleOptions: [
      { label: "司机", value: "DRIVER" },
      { label: "调度员", value: "DISPATCHER" },
      { label: "管理员", value: "ADMIN" },
    ],
  },

  unwatchOperatorIdentity: null,

  onLoad() {
    this.syncIdentity();
    this.unwatchOperatorIdentity = onOperatorIdentityChanged(() =>
      this.syncIdentity(),
    );
  },

  onUnload() {
    this.unwatchOperatorIdentity?.();
  },

  onShow() {
    this.syncIdentity();
  },

  openEntry(event) {
    const path = event.currentTarget.dataset.path;
    if (!path) return;
    wx.navigateTo({ url: path });
  },

  syncIdentity() {
    const identity = readOperatorIdentity();
    const presets = identityPresets().map((preset) => ({
      ...preset,
      active: sameIdentity(identity, preset),
    }));
    this.setData({
      operatorId: identity.operatorId,
      operatorName: identity.operatorName,
      role: identity.role,
      identityLabel: identityLabel(identity),
      isDefaultIdentity: isDefaultOperatorIdentity(identity),
      presets,
    });
  },

  onIdentityInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: event.detail.value });
  },

  selectRole(event) {
    const role = normalizeRole(event.currentTarget.dataset.role);
    this.setData({ role });
  },

  applyPreset(event) {
    const id = event.currentTarget.dataset.id;
    const preset = identityPresets().find((item) => item.id === id);
    if (!preset) return;
    const next = saveOperatorIdentity(preset);
    this.applyIdentity(next, `${preset.title} 已切换`);
  },

  saveIdentity() {
    const next = saveOperatorIdentity({
      operatorId: this.data.operatorId,
      operatorName: this.data.operatorName,
      role: this.data.role,
    });
    this.applyIdentity(next, "身份已保存");
  },

  resetIdentity() {
    const next = resetOperatorIdentity();
    this.applyIdentity(next, "已恢复默认身份");
  },

  applyIdentity(identity, toastTitle) {
    this.syncIdentity();
    wx.showToast({
      title: toastTitle,
      icon: "success",
    });
    return identity;
  },
});

function sameIdentity(left, right) {
  return (
    left.operatorId === right.operatorId &&
    left.operatorName === right.operatorName &&
    left.role === right.role
  );
}
