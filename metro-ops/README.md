# Metro Ops Control · Monorepo

轨道交通乘务与交路管理系统的参考实现。基于 `系统架构方案.md` + `ARCHITECTURE_REVIEW.md` 的修订落地。

## 目录

```
metro-ops/
├── ARCHITECTURE_REVIEW.md      对原方案的 12 处改进
├── packages/
│   └── shared/                 领域类型、状态机、REST/WS 契约、zod schema
├── apps/
│   ├── backend/                NestJS(状态机 + 解析管线 + WS 房间)
│   └── frontend/               Vite+React+TS+Tailwind(slice store + 路由 + 页面)
└── pnpm-workspace.yaml
```

## 主链路

1. 导入 `XLSX` → 任务队列 → 解析 → 标准化 → 复核 → 入库 → 发布版本
2. 司机登录 → 查看当前 trip → `start` → 站点跟踪 → `arrive-terminal` → `archive`
3. 调度员 → 全局交路图 + 历史车次查询(带 `scheduleVersionId`)
4. WS 房间:`network:global` / `route:{id}` / `trip:{id}`

## 本地启动

```bash
pnpm install
pnpm dev:backend        # 3000
pnpm dev:frontend       # 5173
```

## 本地检查

```bash
pnpm run ci                 # lint + typecheck + full test
pnpm run daily:local        # 本地日报同款全量检查
pnpm run ci:restricted      # 受限自动化:跳过 @metro-ops/shared tests
pnpm run daily:automation   # 受限日报自动化同款检查
```

后端测试使用 `node --import tsx --test`,避免受限环境触发 `tsx --test` 的 IPC 权限问题。`@metro-ops/shared` 当前仍用 `tsx --test`,2026-05-25 在开发机执行 `pnpm -r test` 已通过。若受限自动化环境因 tsx IPC 报 `EPERM`,自动化使用 `ci:restricted` / `daily:automation`,同时保持开发机或普通 CI 跑 `pnpm run ci` 覆盖 shared;如果要在受限环境恢复 shared tests,先把 shared runner 换到 `node --test` + loader/预编译,或固化 tsx 的无 IPC 参数。

本地前端默认通过 Vite 代理访问 `http://localhost:3000` 的 `/api` 和 `/ws`。如果后端 WebSocket 单独开端口,可临时设置:

```bash
METRO_OPS_DEV_WS_PROXY_TARGET=ws://localhost:3001 pnpm dev:frontend
```

## 线上分享版

前端可以独立部署到 Netlify。仓库根目录已提供 `netlify.toml`,构建入口是 `metro-ops`,发布目录是 `apps/frontend/dist`。

前端最少环境变量:

```bash
VITE_API_BASE_URL=https://<backend-host>
```

只有当 WebSocket 与 REST API 不在同一个后端源时,才额外设置:

```bash
VITE_WS_BASE_URL=wss://<websocket-host>
```

后端最少环境变量:

```bash
PORT=3000
```

分享页默认连远端 backend:`VITE_API_BASE_URL` 会用于 REST API,WebSocket 会自动推导为 `wss://<backend-host>/ws/network`。`VITE_DEMO_API=true` 是唯一 demo 触发条件;线上真实分享版不要设置它,API 或 WebSocket 失败会暴露错误/离线状态,不会静默回退到 demo 数据。

## 技术要点

- 状态机:`packages/shared/src/state-machines/` 导出只读迁移表 + 事件映射,非法迁移一律抛 `IllegalTransition`
- 幂等:所有写操作要求 `Idempotency-Key` 头,24h 内同 key 返回同结果
- 实时:客户端按页面订阅房间;payload 过 `RafBatcher` 批量刷 store
- 导入置信度:`confidence.trains / segments / duties` 三段独立,复核页按 section 确认

详见 `ARCHITECTURE_REVIEW.md`。
