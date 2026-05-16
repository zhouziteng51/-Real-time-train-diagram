const app = getApp();

function apiRequest(url, options = {}) {
  const { body, header = {}, ...rest } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: buildUrl(url),
      header: {
        "content-type": "application/json",
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

function formatError(status, data) {
  if (typeof data === "string" && data) return `${status}: ${data}`;
  return `${status}`;
}

module.exports = {
  apiRequest,
  buildUrl,
  buildWsUrl,
  randomIdempotencyKey,
};
