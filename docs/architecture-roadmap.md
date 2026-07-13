# 基础设施演进路线

本文记录不改变业务功能的工程演进顺序，避免后续开发再次形成大文件、重复契约和隐式依赖。

## 当前基线

- pnpm workspace 管理 API、Web、Admin 和共享包。
- GitHub Actions 执行格式、Lint、类型、单测、生产构建及空库迁移验证。
- `packages/api-client` 统一 JSON transport、错误结构和 headers 合并。
- 本地 PostgreSQL、Redis、MinIO、Maildev 由 Docker Compose 提供。
- `/healthz` 用于存活检查，`/readyz` 用于有超时且不泄露内部异常的依赖检查。

## 第二阶段：契约和输入边界

1. 新建 `packages/contracts`，用 Zod 或 OpenAPI 维护请求、响应、分页和错误 envelope。
2. 后端控制器不再新增内联 `@Body() body: {...}`；统一使用可执行的 DTO/schema。
3. Web/Admin 按 feature 拆分现有超大 `lib/api.ts`，保留兼容导出并逐步迁移。
4. 区分 `API_INTERNAL_URL` 与浏览器同源 `/api`，对前端环境变量进行构建期校验。

## 第三阶段：状态与测试

1. 对轮询、分页和 mutation 统一使用 React Query，并建立 query-key factory。
2. 引入 Vitest、Testing Library 和 MSW，优先覆盖请求 transport、错误态和管理举报流程。
3. 引入 Playwright，覆盖登录、发帖、举报处理三个关键链路。
4. API 增加 PostgreSQL/Redis 集成测试和迁移约束回归测试。

## 第四阶段：后端模块化

1. 将超大的 AdminService 按用户、举报、内容、案件、系统配置拆成 application service。
2. 功能模块显式导入 Prisma、Redis、审计和对象存储端口，逐步减少全局模块。
3. 将聊天室清理定时器迁移到独立 worker/cron；过渡期使用分布式锁和 single-flight。
4. 为 PostgreSQL、Redis、S3、邮件建立稳定的依赖错误分类和可观测指标。

## 约束

- 每个阶段保持 `pnpm check`、`pnpm build` 和 migration smoke test 全绿。
- 数据库迁移必须可从空库执行，也必须可安全应用到已有数据库。
- 权限校验、数据脱敏和审计属于 API 端职责，不能只依赖前端界面。
- 大版本升级、全仓格式化和业务功能不要混在同一个后续提交中。
