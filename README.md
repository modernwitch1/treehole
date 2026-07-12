# 浙工商树洞

浙江工商大学校园匿名树洞。生产模式下所有核心功能走真实 API，公开论坛只展示匿名身份；管理员后台通过 `manage.unidating.top` 访问，只有全站唯一的超级管理员可查看真实作者且每次访问都会留下审计记录。

```
zjgsu-forum/          ← monorepo 根
├── apps/
│   ├── api/          ← NestJS 后端 (端口 3000)
│   ├── web/          ← Next.js 15 前端 (端口 3001)
│   └── admin/        ← Next.js 15 管理后台 (端口 3002)
├── docker-compose.yml  ← Postgres / Redis / MinIO / Maildev
└── package.json      ← pnpm workspace
```

完整设计：`/Users/hezhong/.claude/plans/zany-roaming-pudding.md`。

---

## 当前状态

- Web 论坛、API、Admin 后台均支持真实后端模式；生产环境必须设置 `NEXT_PUBLIC_USE_MOCK=false`。
- 本地开发可以显式设置 `NEXT_PUBLIC_USE_MOCK=true` 使用演示数据；生产构建检测到 mock 会直接失败。
- 用户登录使用 HttpOnly Cookie 会话；发帖、评论、投票、举报、上传、私信和个人设置接口均要求真实登录用户。
- 管理后台不再使用硬编码管理员账号；`superadmin|admin|moderator` 可登录后台，只有全站唯一的 `superadmin` 可访问身份、注册材料和平台配置等高敏能力。生产环境要求配置 `ADMIN_TOTP_SECRET` 登录二次验证码。
- 匿名昵称由 `ANON_SECRET` + 帖子 ID + 用户 ID 派生，同帖稳定、跨帖不可关联；公开 API 不返回真实作者身份。
- 聊天房仅开放 2 小时，关闭或过期不代表记录立即删除；常规记录默认留存 180 天，可通过 `CHATROOM_RETENTION_DAYS` 在 30–3650 天范围内配置。标记为证据保全（`legalHold`）的记录不会被自动删除；私信目前没有自动过期机制。
- 后台内容管理、注册审批、用户封禁、敏感词管理均接入真实数据库；敏感词规则会在发帖/评论时执行 block/review/mask。
- 管理员可在后台“站点设置”发布全站通知，通知会同步进入用户首页顶部导航栏并支持已读状态。

---

## 一次性环境准备

```bash
# 1. pnpm（macOS 用 Node 22 自带的 corepack）
sudo corepack enable
corepack prepare pnpm@9.15.0 --activate

# 2. OrbStack 已经装好 → 启动它
open -a OrbStack

# 3. 后端 .env
cp apps/api/.env.example apps/api/.env
# 生成 JWT_ACCESS_SECRET / ANON_SECRET 填进去
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. 前端 .env
cp apps/web/.env.example apps/web/.env.local

# 5. 安装所有 workspace 的 deps
pnpm install
```

---

## 本地开发

### 跑前端（最快看到效果）

```bash
pnpm dev:web
# 浏览器打开 http://localhost:3001
```

如果 `.env.local` 中显式设置 `NEXT_PUBLIC_USE_MOCK=true`，前端会使用本地 mock 数据，**不依赖后端**就能跑。会看到：

- 首页：8+ 篇 mock 帖子的 Reddit 风格信息流
- 侧栏：标签入口（含树洞、表白墙等匿名标签）
- 点击帖子 → 详情页 + 评论
- 点击标签 → 标签筛选页
- 右上角主题切换、点赞踩、收藏、分享按钮
- **帖子卡片右侧的 ⋯ 菜单**：登录用户可举报/收藏，管理员操作请进入后台
- 登录、注册、截图审批、找回密码页面

### 跑管理后台

```bash
pnpm dev:admin
# 浏览器打开 http://localhost:3002
```

后台默认蓝色 accent（与论坛橙色区分）+ 深色主题。生产环境请使用 `https://manage.unidating.top`，并确保 `NEXT_PUBLIC_USE_MOCK=false`。

- 仪表盘：总用户/帖子/评论/举报数 + 30 天趋势图（recharts）+ 待处理举报队列预览 + 最近管理动作
- 用户管理：搜索 + 状态/角色筛选 + 表格 + 每行 ⋯ 菜单（禁言/封禁/解封/调权限,带确认对话框）
- 举报队列：待处理 / 已处理 / 已驳回 tabs + 每条举报卡含目标快照 + 举报人理由 + 隐藏/判违规/驳回按钮 + 备注 textarea
- 内容管理：帖子 + 评论双 tab 表格 + 状态 badge + 举报数（标红行）+ ⋯ 操作菜单
- 审计日志：所有管理动作完整可追溯
- 敏感词：真实数据库 CRUD + 发帖/评论命中处理；设置页保留运营配置入口

### 跑后端

```bash
# 启动依赖容器（Postgres + Redis + MinIO + Maildev）
docker compose up -d

# 后端首次准备
pnpm --filter @forum/api prisma generate
pnpm --filter @forum/api prisma migrate dev --name init
pnpm --filter @forum/api prisma:post-migrate
pnpm --filter @forum/api db:seed

# 启动 API
pnpm dev:api
# 验证：curl http://localhost:3000/healthz
```

### 同时跑前后端

开两个终端：

```bash
# 终端 1
pnpm dev:api

# 终端 2
pnpm dev:web
```

---

## 工具入口速查

| 服务          | 用途             | 地址                                                         |
| ------------- | ---------------- | ------------------------------------------------------------ |
| Web           | Next.js 论坛     | http://localhost:3001                                        |
| Admin         | Next.js 管理后台 | http://localhost:3002                                        |
| API           | NestJS           | http://localhost:3000                                        |
| Postgres      | DB               | `postgresql://forum:forum_dev_password@localhost:5432/forum` |
| Redis         | 缓存 / 限流      | `redis://localhost:6379`                                     |
| MinIO Console | S3 mock          | http://localhost:9001 (`local-dev-key` / `local-dev-secret`) |
| Maildev Web   | 验证邮件收件箱   | http://localhost:1080                                        |
| Prisma Studio | DB GUI           | `pnpm --filter @forum/api prisma:studio`                     |

---

## 常用命令

| 命令                                                                                | 作用                           |
| ----------------------------------------------------------------------------------- | ------------------------------ |
| `pnpm dev:web`                                                                      | 启动前端开发                   |
| `pnpm dev:api`                                                                      | 启动后端开发                   |
| `pnpm build`                                                                        | 全部 workspace 编译            |
| `pnpm typecheck`                                                                    | 全部 workspace TypeScript 检查 |
| `pnpm lint`                                                                         | 全部 workspace lint 修复       |
| `pnpm format`                                                                       | Prettier 格式化全仓            |
| `pnpm --filter @forum/api prisma:studio`                                            | 数据库 GUI                     |
| `pnpm --filter @forum/api db:seed`                                                  | 重新种子版块                   |
| `pnpm --filter @forum/api superadmin:transfer -- --from OLD --to NEW --confirm NEW` | 事务化转移唯一超级管理员       |
| `pnpm --filter @forum/web build`                                                    | 仅前端构建                     |

---

## 前端技术栈

- **Next.js 15** App Router + RSC + Turbopack
- **React 19**
- **Tailwind CSS v4**（CSS-first 配置 + oklch 色彩空间）
- **shadcn/ui 风格**（Radix UI primitives + cva + tailwind-merge）
- **next-themes**（深色模式默认 + 浅色切换）
- **TanStack Query**（数据缓存层，slice 2 起接真 API）
- **lucide-react**（图标）
- **date-fns** + 中文 locale（相对时间）

页面：

- `/` 首页信息流
- `/b/[slug]` 版块页
- `/b/[slug]/[postId]` 帖子详情 + 评论树
- `/login`, `/register` 校园邮箱登录注册

设计风：**Reddit 2023+ 重设计**，圆角卡片 + 横向胶囊投票按钮 + 默认深色 + 浙工商橙作为 accent。

---

## 后端技术栈

- **Node.js 20+** + **NestJS 10** + **TypeScript**
- **PostgreSQL 16**（citext + ltree + pgcrypto）
- **Redis 7**（缓存 / 限流 / pubsub）
- **Prisma 5** ORM
- **AWS SES**（邮件）/ **S3** + **Rekognition**（图片）
- **Pino** 结构化日志 + **Sentry** 错误追踪

## 生产安全约定

- `JWT_ACCESS_SECRET` 和 `ANON_SECRET` 必须是不同的强随机值；`ANON_SECRET` 上线后不要轮换，否则历史匿名昵称会变化。
- API 会话使用 `forum_access_token` / `forum_refresh_token` HttpOnly Cookie；Admin 使用独立 `admin_access_token` HttpOnly Cookie。
- 生产环境需要配置 `ADMIN_TOTP_SECRET`，后台管理员登录必须输入 6 位 TOTP 动态码。
- 图片上传会校验文件魔数、拒绝 SVG、重新编码为安全图片格式后上传到 S3/CloudFront。
- 普通用户接口永不返回真实作者 ID、邮箱或用户名；只有超级管理员可查看真实身份，且每次查看都会写入后台审计日志。
- 仅全站唯一的超级管理员可通过受控权限对聊天房记录进行溯源，每次查询都会自动写入审计日志；普通管理员和版主无此权限。
- 不要用手工 SQL 交换超级管理员。先确保目标账号是已验证、状态正常的 `admin`，再运行 `pnpm --filter @forum/api superadmin:transfer -- --from 当前用户名 --to 目标用户名 --confirm 目标用户名`。命令会锁定转移事务、先降级旧超管再升级目标、写审计并撤销双方后台会话；任何校验或数据库步骤失败都会回滚角色变更。

---

## 故障排查

**前端 `pnpm dev:web` 卡住或报错**

- 删 `apps/web/.next` 重新跑
- 看是不是 Node 版本 < 20

**后端 `/readyz` 503**

- `docker compose ps` 看 postgres / redis 是不是健康
- 看 `.env` 里 `DATABASE_URL` 用户名密码对不对

**Maildev 看不到验证邮件**

- 开发环境 `MAIL_DRIVER=smtp` + `SMTP_HOST=localhost` + `SMTP_PORT=1025`
- 收件箱：http://localhost:1080
