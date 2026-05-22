const API_STORAGE_KEY = "metroOpsApiBaseUrl";
const WS_STORAGE_KEY = "metroOpsWsBaseUrl";
const CHANGE_EVENT_NAME = "metroOpsBackendConfigChanged";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_WS_BASE_URL = "ws://127.0.0.1:3001";

function readBackendConfig() {
  const apiBaseUrl = wx.getStorageSync(API_STORAGE_KEY) || DEFAULT_API_BASE_URL;
  const wsBaseUrl = wx.getStorageSync(WS_STORAGE_KEY) || DEFAULT_WS_BASE_URL;
  return { apiBaseUrl, wsBaseUrl };
}

function saveBackendConfig(config) {
  const apiBaseUrl = normalizeUrl(config.apiBaseUrl);
  const wsBaseUrl = normalizeUrl(config.wsBaseUrl);
  wx.setStorageSync(API_STORAGE_KEY, apiBaseUrl);
  wx.setStorageSync(WS_STORAGE_KEY, wsBaseUrl);
  const nextConfig = { apiBaseUrl, wsBaseUrl };
  applyBackendConfig(nextConfig);
  notifyBackendConfigChanged(nextConfig);
  return nextConfig;
}

function resetBackendConfig() {
  wx.removeStorageSync(API_STORAGE_KEY);
  wx.removeStorageSync(WS_STORAGE_KEY);
  const config = {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    wsBaseUrl: DEFAULT_WS_BASE_URL,
  };
  applyBackendConfig(config);
  notifyBackendConfigChanged(config);
  return config;
}

function applyBackendConfig(config) {
  const app = getApp();
  if (!app?.globalData) return;
  app.globalData.apiBaseUrl = config.apiBaseUrl;
  app.globalData.wsBaseUrl = config.wsBaseUrl;
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isDefaultBackendConfig(config) {
  return (
    normalizeUrl(config.apiBaseUrl) === DEFAULT_API_BASE_URL &&
    normalizeUrl(config.wsBaseUrl) === DEFAULT_WS_BASE_URL
  );
}

function onBackendConfigChanged(listener) {
  const app = getApp();
  if (!app) return () => {};
  const listeners = getListeners(app);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyBackendConfigChanged(config) {
  const app = getApp();
  if (!app) return;
  const listeners = getListeners(app);
  for (const listener of listeners) listener(config);
}

function getListeners(app) {
  if (!app[CHANGE_EVENT_NAME]) app[CHANGE_EVENT_NAME] = new Set();
  return app[CHANGE_EVENT_NAME];
}

function backendPresets() {
  return [
    {
      id: "local",
      title: "默认本地",
      note: "开发者工具本机",
      apiBaseUrl: DEFAULT_API_BASE_URL,
      wsBaseUrl: DEFAULT_WS_BASE_URL,
    },
    {
      id: "lan",
      title: "局域网",
      note: "手机访问电脑后端",
      apiBaseUrl: "http://192.168.1.100:3000",
      wsBaseUrl: "ws://192.168.1.100:3001",
    },
    {
      id: "remote",
      title: "远端模板",
      note: "保存前改成实际域名",
      apiBaseUrl: "https://your-metro-ops-backend.example.com",
      wsBaseUrl: "wss://your-metro-ops-backend.example.com",
    },
  ];
}

module.exports = {
  API_STORAGE_KEY,
  WS_STORAGE_KEY,
  DEFAULT_API_BASE_URL,
  DEFAULT_WS_BASE_URL,
  applyBackendConfig,
  backendPresets,
  isDefaultBackendConfig,
  onBackendConfigChanged,
  readBackendConfig,
  resetBackendConfig,
  saveBackendConfig,
};
