# Code Visualization

基于当前代码整理，不引用方案稿假设。

## 1. 系统结构图

```mermaid
flowchart LR
    U["用户"] --> FE["Frontend<br/>Vite + React + React Router<br/>apps/frontend"]
    FE --> RQ["React Query"]
    FE --> ZS["Zustand Stores"]
    FE --> WSCLIENT["RealtimeProvider"]

    FE -->|HTTP /api| VITE["Vite Dev Server :5173<br/>proxy /api -> :3000"]
    FE -->|WS /ws/network| VITE

    VITE --> BE["Backend API :3000<br/>NestJS apps/backend"]
    VITE --> WSS["WebSocket Server :3001<br/>RealtimeGateway"]

    BE --> MOD1["OperatorModule"]
    BE --> MOD2["TripModule"]
    BE --> MOD3["ImportModule"]
    BE --> MOD4["RealtimeModule"]

    MOD2 --> TRIPSTORE["TripStore<br/>内存任务/事件"]
    MOD3 --> IMPORTSTORE["ImportStore<br/>内存任务/文件/文档"]
    MOD3 --> WORKER["ImportParseWorker"]
    MOD4 --> SIM["RealtimeSimulator"]

    WORKER --> PARSER["ParserFactory<br/>XLSX / DOCX / PDF"]
    PARSER --> SHARED["packages/shared<br/>domain + contracts + state-machines"]
    MOD2 --> SHARED
    MOD3 --> SHARED
    FE --> SHARED

    SIM --> WSS
    IMPORTSTORE --> WSS
    TRIPSTORE --> WSS
```

## 2. 前端页面与数据关系

```mermaid
flowchart TD
    APP["AppShell"] --> DASH["/ DashboardPage"]
    APP --> GRAPH["/running-graph RunningGraphPage"]
    APP --> ATTACHED["/attached-route/:tripId AttachedRoutePage"]
    APP --> SCHEDULE["/master-schedule MasterSchedulePage"]
    APP --> HISTORY["/history-trips HistoryTripsPage"]
    APP --> IMPORTS["/imports/:jobId? ImportCenterPage"]

    DASH --> OPAPI["GET /api/operators/me"]
    DASH --> RTSTORE["realtimeStore.vehiclesById"]

    GRAPH --> RTSTORE

    ATTACHED --> TRIPDETAIL["GET /api/trips/:tripId"]
    ATTACHED --> TRIPSTART["POST /api/trips/:tripId/start"]
    ATTACHED --> TRIPARRIVE["POST /api/trips/:tripId/arrive-terminal"]
    ATTACHED --> TRIPARCHIVE["POST /api/trips/:tripId/archive"]
    ATTACHED --> APPSTORE["appStore.selectedTripId"]

    SCHEDULE --> ACTIVE["GET /api/trips/active"]
    SCHEDULE --> NAVHISTORY["跳转 history-trips<br/>携带 trainNo/routeId/scheduleVersionId"]

    HISTORY --> HQS["historyQueryStore"]
    HISTORY --> HISTORYAPI["GET /api/trips/history?..."]

    IMPORTS --> IMPORTLIST["GET /api/imports"]
    IMPORTS --> IMPORTDETAIL["GET /api/imports/:jobId"]
    IMPORTS --> IMPORTPREVIEW["GET /api/imports/:jobId/preview"]
    IMPORTS --> IMPORTUPLOAD["POST /api/imports"]
    IMPORTS --> IMPORTCONFIRM["POST /api/imports/:jobId/confirm"]
    IMPORTS --> IMPORTSTORE2["importStore.currentJobId"]

    WSCLIENT["RealtimeProvider"] --> RTSTORE
    WSCLIENT --> IMPORTSTORE2
    WSCLIENT --> APPSTORE
```

## 3. 实时链路

```mermaid
sequenceDiagram
    participant Sim as RealtimeSimulator
    participant GW as RealtimeGateway(:3001)
    participant FE as RealtimeProvider
    participant Batch as RafBatcher
    participant Store as realtimeStore / importStore
    participant Query as React Query Cache

    Sim->>GW: 每 2 秒 broadcast VehicleUpdated
    FE->>GW: 连接 /ws/network
    FE->>GW: subscribe network:global
    FE->>GW: 按页面动态订阅 trip:{id} / import:{id}

    GW-->>FE: network.vehicle.updated
    FE->>Batch: push(items, sentAt)
    Batch->>Store: mergeVehicles()

    GW-->>FE: import.job.updated
    FE->>Store: upsertJob(job)
    FE->>Query: invalidate imports / imports/:id

    GW-->>FE: trip.status.changed
    FE->>Query: invalidate trip/:id + active + history
```

## 4. 导入链路

```mermaid
flowchart TD
    A["ImportCenterPage 上传文件"] --> B["POST /api/imports"]
    B --> C["ImportController.upload"]
    C --> D["ImportStore.createJob<br/>status=UPLOADED"]
    D --> E["WS: import.job.updated"]
    C --> F["queueMicrotask enqueueParse(jobId)"]
    F --> G["ImportParseWorker.handle"]
    G --> H["status=PARSING"]
    G --> I["ParserFactory.create(sourceType)"]
    I --> J["XlsxScheduleParser / DocxOcrHybridParser / PdfOcrHybridParser"]
    J --> K["extract(buffer) -> NormalizedImportDocument"]
    K --> L["scoreDocument / overallScore"]
    L --> M["ImportStore.saveDoc"]
    M --> N{"overall < 0.85<br/>或 warnings > 0?"}
    N -->|是| O["status=REVIEW_REQUIRED"]
    N -->|否| P["status=NORMALIZED"]
    O --> E
    P --> E

    Q["确认入库"] --> R["POST /api/imports/:jobId/confirm"]
    R --> S["ImportDomainService.confirmAndImport"]
    S --> T["REVIEW_REQUIRED -> NORMALIZED"]
    T --> U["upsert trains / segments / duties<br/>当前代码为 logger.debug"]
    U --> V["status=IMPORTED"]
    V --> E
```

## 5. 车次状态机

```mermaid
stateDiagram-v2
    [*] --> PLANNED
    PLANNED --> ACTIVE: START / DEPART_ORIGIN
    PLANNED --> CANCELLED: CANCEL
    ACTIVE --> ARRIVING_TERMINAL: ENTER_TERMINAL_APPROACH / ARRIVE_TERMINAL
    ACTIVE --> CANCELLED: CANCEL
    ARRIVING_TERMINAL --> ARCHIVED: ARCHIVE
```

## 6. 导入任务状态机

```mermaid
stateDiagram-v2
    [*] --> UPLOADED
    UPLOADED --> PARSING
    UPLOADED --> FAILED
    PARSING --> REVIEW_REQUIRED
    PARSING --> NORMALIZED
    PARSING --> FAILED
    REVIEW_REQUIRED --> PARSING
    REVIEW_REQUIRED --> NORMALIZED
    REVIEW_REQUIRED --> FAILED
    NORMALIZED --> IMPORTED
    NORMALIZED --> FAILED
    IMPORTED --> ARCHIVED
    FAILED --> PARSING
```

## 7. 代码里的主事实

- 前端走 `:5173`，HTTP 代理到 `:3000`，WebSocket 代理到 `:3001`
- 后端 `TripStore`、`ImportStore`、`RealtimeSimulator` 目前都是内存实现
- `packages/shared` 是前后端共用契约中心，承载 `domain`、`REST/WS contracts`、`state-machines`
- 实时消息目前有 3 类真正被前端消费：`network.vehicle.updated`、`import.job.updated`、`trip.status.changed`
- 导入“确认入库”目前没有真实数据库写入，代码只做状态推进和 `logger.debug`
