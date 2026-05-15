# 架构方案审查与修订

对 `系统架构方案.md` 做一遍深读后,抓出 12 处改进点。下面的改动已经同步落到本 monorepo 的代码里。

## 1. Zustand store 不该是单体

**原方案**:`AppStoreState` 把操作人、值乘、选中、历史筛选、导入任务、实时车位全塞在一个 `create()` 里。

**问题**:任何一次 `mergeRealtimeVehicles`(高频)都会让所有订阅该 store 的组件进入 `shallow` 比较,写起来容易漏 selector。测试时也没办法单独替换一个切片。

**修订**:用 slice 模式拆成 `operatorSlice / dutySlice / selectionSlice / historyQuerySlice / importSlice / realtimeSlice`,每个 slice 独立导出 hook。实时切片单独挂到一个 store 实例,避免污染业务状态。见 `apps/frontend/src/store/`。

## 2. `archiveCurrentTrip` 不该由前端推断

**原方案**:前端在 store 里直接把 `currentDuty.status` 置为 `ARCHIVED`,再改 `historyQuery`。

**问题**:归档是领域事件,必须走服务端写 `trip_events` 审计 + 触发 WS 广播。前端抢跑只会造成"UI 显示已归档但 DB 还没写入"的不一致。

**修订**:前端只发 `POST /api/trips/:id/archive`,服务端状态机迁移成功后广播 `trip.status.changed`,前端通过 `invalidateQueries(['trips', id])` 刷新。本地 store 只保留"我刚点了归档按钮"的短暂 UI 意图(`archivePending`)。见 `apps/backend/src/trip/trip-lifecycle.ts`、`apps/frontend/src/store/dutySlice.ts`。

## 3. `goToHistoryFromXxx` 会产出空参

**原方案**:`createSearchParams({ trainNo: payload.trainNo ?? "" })` 会把空字符串写进 URL,`?trainNo=&routeId=` 很丑而且后端如果做了 "`!= undefined`" 判断会走错分支。

**修订**:统一用 `buildSearch(params)` 工具函数,falsy 的 key 直接剔除。见 `apps/frontend/src/navigation/toHistory.ts`。

## 4. Trip 状态机没有守卫表

**原方案**:文字叙述 `PLANNED -> ACTIVE -> ARRIVING_TERMINAL -> ARCHIVED`,没有落到类型系统里。

**问题**:`archive()` 可以被从 `PLANNED` 直接触发(跳过 ACTIVE),靠 if/else 防不住。

**修订**:用不可变的 `TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]>` + 事件映射 `TRIP_EVENT_TO_TARGET`,非法迁移立即抛 `IllegalTripTransition`,且每次迁移写一条 `TripEvent`(含触发源:`REALTIME|OPERATOR|SYSTEM`)。见 `packages/shared/src/state-machines/trip.ts`。

## 5. 导入状态机缺 `REVIEW_REQUIRED -> *` 出路

**原方案**:`REVIEW_REQUIRED` 没有指明人工修正后的去向,只靠隐式"修正 -> 重放 `normalize` -> 走入库"。

**问题**:重放会新建任务还是复用旧任务?失败后能否回到 `REVIEW_REQUIRED`?

**修订**:明确 `REVIEW_REQUIRED -> NORMALIZED` (操作人确认) / `REVIEW_REQUIRED -> FAILED` (拒绝) / `NORMALIZED -> IMPORTED`(入库成功) / `IMPORTED -> ARCHIVED`(版本被替换后归档)。见 `packages/shared/src/state-machines/import.ts`。

## 6. 单一 `confidenceScore` 表达力不够

**原方案**:只有一个顶级 `confidenceScore: number`。

**问题**:Excel 车次部分识别率 0.95 但交路部分只有 0.6,一刀切阈值要么误放行要么误挡。

**修订**:`confidence: { trains, segments, duties }` 独立打分,复核页按 section 选择性接受。顶层 `confidenceScore` 保留做整体预览。见 `packages/shared/src/domain/import.ts`。

## 7. WebSocket 缺房间策略

**原方案**:`WS /ws/network` 广播所有事件。

**问题**:正常运营 120+ 车次 × 每秒 2 次推送,一个客户端每秒要处理 240 条消息且大多数用不上。

**修订**:分房间 `network:global`、`route:{routeId}`、`trip:{tripId}`;客户端根据当前页面订阅,页面切换时 `subscribe/unsubscribe`。见 `apps/backend/src/realtime/room-strategy.ts`、`apps/frontend/src/realtime/useRealtimeSocket.ts`。

## 8. 实时车位合并缺少批处理

**原方案**:`mergeRealtimeVehicles(items)` 每条消息都 `set()`。

**问题**:React 18 并发模式下高频 set 也许还好,但在 iPad Safari 上 100 Hz 的 setState 会掉帧。

**修订**:socket 接到的 payload 先进 `RafBatcher`,每 rAF(约 16ms)批量刷一次 store。见 `apps/frontend/src/realtime/batcher.ts`。

## 9. `HistoryQuery.source` 设计模糊

**原方案**:`source: "master-schedule" | "attached-route" | "dashboard"` 塞在筛选条件里。

**问题**:来源是导航上下文,不是筛选维度;未来加入分享链接时 source 就丢真相了。

**修订**:`source` 从 `historyQuery` 移到 URL query `from=attached-route`,历史页据此渲染"返回 {source}"面包屑。见 `apps/frontend/src/pages/HistoryTripsPage.tsx`。

## 10. 列车/司机操作缺幂等

**原方案**:`POST /api/trips/:id/start` 无幂等。

**问题**:司机车载 iPad 网络差,重试可能重复触发状态迁移。

**修订**:所有写操作要求 `Idempotency-Key` 头,服务端 24h 内同 key 返回同结果。见 `apps/backend/src/common/idempotency.interceptor.ts`。

## 11. `normalizeSemiStructuredBlocks` 的 `fileName: ""` 是 bug

原方案伪代码里 `fileName: ""` 直接写死,意味着除 XLSX 外所有解析器产物的文件名都丢了。

**修订**:`ParserContext` 贯穿 `extract/normalize`,`meta.fileName` 从入参拿,而不是硬编码空串。见 `apps/backend/src/import/parsers/normalize.ts`。

## 12. `RealtimeVehicleState.status` 缺 `DWELLING`

**原方案**:`"RUNNING" | "STOPPED" | "OFFLINE" | "ARRIVED"`。

**问题**:`STOPPED` 对调度员来说含义太广(站台停站?区间抛锚?);`ARRIVED` 只代表终点到达,不能表达中间站停站。

**修订**:新增 `DWELLING`(站台停站,默认≤90s)和 `HELD`(异常停车)。状态机驱动 UI 颜色:DWELLING 蓝、HELD 橙、OFFLINE 灰、STOPPED 暗红。见 `packages/shared/src/domain/realtime.ts`。

---

## 落地优先级(对原第 10 节的补充)

原方案建议第一阶段跑 `XLSX 导入、实时车位推送、随车交路归档、历史查询`。保留,但加两件事:

1. **先打通 trip 状态机 + 审计日志**,所有后续功能都挂在这条轴上,走错会很痛。
2. **第 2 周就把 idempotency + WS 房间 + rAF 批处理接入**,这三件事是"改起来便宜、后期改贵"的典型。
