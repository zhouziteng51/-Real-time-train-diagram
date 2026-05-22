const STORAGE_KEY = "metroOpsOperatorIdentity";
const CHANGE_EVENT_NAME = "metroOpsOperatorIdentityChanged";

const DEFAULT_OPERATOR_IDENTITY = {
  operatorId: "op-001",
  operatorName: "张三",
  role: "DRIVER",
};

const ROLE_LABELS = {
  DRIVER: "司机",
  DISPATCHER: "调度",
  ADMIN: "管理员",
};

function readOperatorIdentity() {
  const stored = readStoredIdentity();
  return normalizeIdentity(stored || DEFAULT_OPERATOR_IDENTITY);
}

function saveOperatorIdentity(identity) {
  const nextIdentity = normalizeIdentity(identity);
  wx.setStorageSync(STORAGE_KEY, nextIdentity);
  applyOperatorIdentity(nextIdentity);
  notifyOperatorIdentityChanged(nextIdentity);
  return nextIdentity;
}

function resetOperatorIdentity() {
  wx.removeStorageSync(STORAGE_KEY);
  const identity = { ...DEFAULT_OPERATOR_IDENTITY };
  applyOperatorIdentity(identity);
  notifyOperatorIdentityChanged(identity);
  return identity;
}

function applyOperatorIdentity(identity) {
  const app = getApp();
  if (!app?.globalData) return;
  const nextIdentity = normalizeIdentity(identity);
  app.globalData.operatorId = nextIdentity.operatorId;
  app.globalData.operatorName = nextIdentity.operatorName;
  app.globalData.operatorRole = nextIdentity.role;
}

function onOperatorIdentityChanged(listener) {
  const app = getApp();
  if (!app) return () => {};
  const listeners = getListeners(app);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyOperatorIdentityChanged(identity) {
  const app = getApp();
  if (!app) return;
  const listeners = getListeners(app);
  for (const listener of listeners) listener(identity);
}

function roleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || ROLE_LABELS.DRIVER;
}

function identityLabel(identity) {
  const current = normalizeIdentity(identity);
  return `${current.operatorName || "未命名"} · ${current.operatorId || "--"} · ${roleLabel(current.role)}`;
}

function isDefaultOperatorIdentity(identity) {
  const current = normalizeIdentity(identity);
  return (
    current.operatorId === DEFAULT_OPERATOR_IDENTITY.operatorId &&
    current.operatorName === DEFAULT_OPERATOR_IDENTITY.operatorName &&
    current.role === DEFAULT_OPERATOR_IDENTITY.role
  );
}

function normalizeIdentity(identity) {
  return {
    operatorId:
      String(identity?.operatorId || "").trim() ||
      DEFAULT_OPERATOR_IDENTITY.operatorId,
    operatorName:
      String(identity?.operatorName || "").trim() ||
      DEFAULT_OPERATOR_IDENTITY.operatorName,
    role: normalizeRole(identity?.role || identity?.operatorRole),
  };
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toUpperCase();
  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "DISPATCHER") return "DISPATCHER";
  return "DRIVER";
}

function readStoredIdentity() {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (!stored || typeof stored !== "object") return null;
  return stored;
}

function getListeners(app) {
  if (!app[CHANGE_EVENT_NAME]) app[CHANGE_EVENT_NAME] = new Set();
  return app[CHANGE_EVENT_NAME];
}

function identityPresets() {
  return [
    {
      id: "driver-001",
      title: "张三",
      note: "默认司机 · op-001",
      operatorId: "op-001",
      operatorName: "张三",
      role: "DRIVER",
    },
    {
      id: "driver-002",
      title: "李四",
      note: "值乘匹配 · op-002",
      operatorId: "op-002",
      operatorName: "李四",
      role: "DRIVER",
    },
    {
      id: "driver-003",
      title: "王五",
      note: "值乘匹配 · op-003",
      operatorId: "op-003",
      operatorName: "王五",
      role: "DRIVER",
    },
    {
      id: "dispatcher",
      title: "调度员",
      note: "导入列表 / 历史查询",
      operatorId: "dispatcher-001",
      operatorName: "调度员",
      role: "DISPATCHER",
    },
    {
      id: "admin",
      title: "管理员",
      note: "导入确认 ADMIN 接口",
      operatorId: "admin-001",
      operatorName: "管理员",
      role: "ADMIN",
    },
  ];
}

module.exports = {
  DEFAULT_OPERATOR_IDENTITY,
  STORAGE_KEY,
  applyOperatorIdentity,
  identityLabel,
  identityPresets,
  isDefaultOperatorIdentity,
  normalizeIdentity,
  normalizeRole,
  onOperatorIdentityChanged,
  readOperatorIdentity,
  resetOperatorIdentity,
  roleLabel,
  saveOperatorIdentity,
};
