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

## 联调记录

后端地址检查：

1. 本机开发者工具使用 `http://127.0.0.1:3000` 和 `ws://127.0.0.1:3001`
2. 真机联调先在电脑上执行 `ipconfig getifaddr en0` 获取局域网 IP
3. 小程序打开「更多」->「后端设置」，选择「局域网」，把 API 改为 `http://<电脑局域网IP>:3000`，WS 改为 `ws://<电脑局域网IP>:3001`
4. 切换后进入「更多」->「导入状态」，能看到导入任务列表表示 API 地址已连通；进入「运行图」能看到实时订阅表示 WS 地址已连通

运行图 / 班表导入步骤：

1. 用 Web 端「导入中心」上传 `.xlsx`、`.docx` 或 `.pdf` 文件，后端接口为 `POST /api/imports`
2. 上传后等待任务进入 `REVIEW_REQUIRED` 或 `NORMALIZED`
3. 在小程序「更多」->「导入状态」打开任务详情，检查车次、交路、值乘预览
4. 需要入库时把身份切到「管理员」，在任务详情页确认导入；确认接口为 `POST /api/imports/:jobId/confirm`
5. 回到「运行图」「当前司机交路」「排班」页面，检查导入后的运行图和班表是否刷新

## 当前范围

- 首页值乘总览
- 运行图
- 当前司机交路
- 任务详情
- 更多：时刻表 / 排班 / 历史 / 导入状态
- 开始值乘 / 标记终到 / 归档
- 实时车次订阅
