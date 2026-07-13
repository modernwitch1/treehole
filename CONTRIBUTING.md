# 开发贡献指南

## 环境要求

- Node.js 22（项目根目录提供 `.nvmrc`）
- pnpm 9.15.0
- Docker 与 Docker Compose

不要提交真实 `.env`、Token、生产数据库连接或云服务密钥。仓库只保留 `.env.example`。

## 首次启动

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

默认地址：

- API：`http://localhost:3000`
- Web：`http://localhost:3001`
- 管理后台：`http://localhost:3002`
- Maildev：`http://localhost:1080`
- MinIO 控制台：`http://localhost:9001`

API 提供两类健康检查：

- `GET /healthz`：进程存活状态
- `GET /readyz`：PostgreSQL、Redis 等依赖就绪状态

## 日常开发

```bash
pnpm dev                 # 并行启动 API、Web 和管理后台
pnpm dev:api             # 只启动 API
pnpm dev:web             # 只启动用户端
pnpm dev:admin           # 只启动管理后台
pnpm infra:logs          # 查看本地依赖日志
pnpm infra:down          # 停止本地依赖并保留数据卷
```

新增或修改 Prisma 模型后：

```bash
pnpm db:generate
pnpm db:migrate
```

迁移文件必须和对应的 Prisma schema 修改一起提交。生产环境只运行
`pnpm db:migrate:deploy`，不要在生产运行开发迁移或数据库重置命令。

## 提交前检查

```bash
pnpm check
pnpm build
```

`pnpm check` 依次检查格式、ESLint、TypeScript 和测试。GitHub Actions 会执行相同质量门禁，随后进行生产构建。

生产进程统一由根目录 `ecosystem.config.cjs` 定义。部署脚本和人工操作都应复用该文件，不要分别维护 PM2 启动参数。

## 代码边界

- `apps/api`：NestJS API、Prisma 数据访问和后台权限校验。
- `apps/web`：普通用户端 Next.js 应用。
- `apps/admin`：管理后台 Next.js 应用。
- `packages`：未来放置跨应用共享且不依赖运行环境的类型、常量或工具；不要把数据库客户端、服务端密钥或浏览器专用代码混入同一个共享包。

权限校验必须落在 API 端。前端隐藏菜单只能改善体验，不能替代后端鉴权。涉及身份、处罚、权限变更或内容处置的操作应保留审计记录。

## Pull Request 建议

- 一次 PR 聚焦一个可验证的目标。
- 描述数据库迁移、环境变量、兼容性和回滚方式。
- 新增业务分支时补充最小单元测试；修复缺陷时优先添加回归测试。
- 不把格式化、依赖大升级和业务改动混在同一个提交中。
