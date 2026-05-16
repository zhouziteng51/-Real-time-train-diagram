# 微信小程序接入

这是 `metro-ops` 的微信小程序客户端，走同一套后端接口：

- `GET /api/operators/me`
- `GET /api/trips/active`
- `GET /api/trips/:tripId`
- `POST /api/trips/:tripId/start`
- `POST /api/trips/:tripId/arrive-terminal`
- `POST /api/trips/:tripId/archive`
- `ws://<host>:3001/ws/network`

## 打开方式

1. 用微信开发者工具导入 `apps/miniprogram`
2. 把 `miniprogram/app.js` 里的 `apiBaseUrl` 和 `wsBaseUrl` 改成你的后端地址
3. 确保小程序后台配置了合法域名，或者本地开发时关闭校验

## 当前范围

- 当前司机任务
- 任务详情
- 开始值乘 / 标记终到 / 归档
- 实时车次订阅
