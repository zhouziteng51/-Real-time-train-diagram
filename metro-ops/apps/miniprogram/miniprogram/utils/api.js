const app = getApp();
const { readOperatorIdentity } = require("./operatorIdentity");

function apiRequest(url, options = {}) {
  const { body, header = {}, idempotencyKey, role, ...rest } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: buildUrl(url),
      header: {
        "content-type": "application/json",
        ...defaultAuthHeaders(role),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        ...header,
      },
      data: body,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(formatError(res.statusCode, res.data)));
          return;
        }
        resolve(res.data);
      },
      fail: (err) => reject(err),
      ...rest,
    });
  });
}

function buildUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  const base = app.globalData.apiBaseUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildWsUrl(path) {
  if (/^wss?:\/\//.test(path)) return path;
  const base = app.globalData.wsBaseUrl.replace(/\/$/, "");
  return `${base}${path}`;
}

function randomIdempotencyKey() {
  return `wx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultAuthHeaders(role) {
  const identity = readOperatorIdentity();
  const {
    operatorId = identity.operatorId,
    operatorName = identity.operatorName,
    operatorRole = identity.role,
  } = app.globalData || {};
  const headers = {
    "x-user-role": role || operatorRole || "DRIVER",
  };
  if (operatorId) headers["x-user-id"] = operatorId;
  if (operatorName) headers["x-user-name"] = operatorName;
  return headers;
}

function formatError(status, data) {
  if (typeof data === "string" && data) return `${status}: ${data}`;
  if (data && typeof data === "object") {
    const message = Array.isArray(data.message)
      ? data.message.join("；")
      : data.message;
    return `${status}: ${message || data.code || JSON.stringify(data)}`;
  }
  return `${status}`;
}

module.exports = {
  apiRequest,
  buildUrl,
  buildWsUrl,
  defaultAuthHeaders,
  randomIdempotencyKey,
};
