# 微信小程序接入

这是 `metro-ops` 的微信小程序客户端，走同一套后端接口：

- `GET /api/operators/me`
- `GET /api/trips/active`
- `GET /api/runtime/duties`
- `GET /api/trips/:tripId`
- `GET /api/trips/history`
- `GET /api/imports`
- `POST /api/trips/:tripId/start`
- `POST /api/trips/:tripId/arrive-terminal`
- `POST /api/trips/:tripId/archive`
- `ws://<host>:3001/ws/network`

## 打开方式

1. 用微信开发者工具导入 `apps/miniprogram`
2. 默认后端地址是 `http://127.0.0.1:3000` 和 `ws://127.0.0.1:3001`
3. 确保小程序后台配置了合法域名，或者本地开发时关闭校验

真机调试时，`127.0.0.1` 指向手机自身，需要改成电脑局域网 IP。打开小程序「更多」->「后端设置」，选择「局域网」并把地址改成电脑 IP，也可以切到远端演示环境或恢复默认本地地址。

## 当前范围

- 首页值乘总览
- 运行图
- 当前司机交路
- 任务详情
- 更多：时刻表 / 排班 / 历史 / 导入状态
- 开始值乘 / 标记终到 / 归档
- 实时车次订阅
