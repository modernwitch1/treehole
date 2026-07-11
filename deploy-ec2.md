# 浙工商树洞 · EC2 部署教程（实战版）

> 基于 Ubuntu 24.04 LTS，结合真实踩坑经验编写。
> 遇到任何报错，先看对应步骤下面的「如果出错」段落。

---

## 目录

1. [启动 EC2 实例](#1-启动-ec2-实例)
2. [SSH 连接 + 基础设置](#2-ssh-连接--基础设置)
3. [安装 Node.js / pnpm / PM2](#3-安装-nodejs--pnpm--pm2)
4. [安装 PostgreSQL + Redis](#4-安装-postgresql--redis)
5. [上传代码到服务器](#5-上传代码到服务器)
6. [安装项目依赖（避坑重点）](#6-安装项目依赖避坑重点)
7. [配置环境变量](#7-配置环境变量)
8. [数据库建表](#8-数据库建表)
9. [构建所有应用](#9-构建所有应用)
10. [PM2 启动进程](#10-pm2-启动进程)
11. [Nginx 反向代理](#11-nginx-反向代理)
12. [配置域名 + HTTPS](#12-配置域名--https)
13. [日常维护](#13-日常维护)
14. [附录：常见报错速查](#14-附录常见报错速查)

---

## 1. 启动 EC2 实例

AWS 控制台操作：

| 配置项   | 推荐值                                                   |
| -------- | -------------------------------------------------------- |
| 名称     | `zjgsu-forum`                                            |
| 系统镜像 | **Ubuntu 24.04 LTS**                                     |
| 架构     | x86（兼容性好）或 arm64（便宜，但需注意包名差异）        |
| 实例类型 | **t3.medium**（2C4G，起步够用）                          |
| 密钥对   | 创建新密钥 → 下载 `.pem` 到 `~/Downloads/hezhong666.pem` |
| 存储     | **30 GB** gp3（20 GB 不够，npm 依赖就占好几 G）          |
| 安全组   | ✅ SSH(22) ✅ HTTP(80) ✅ HTTPS(443)                     |

### 绑定弹性 IP（推荐）

不绑定的话，每次重启 EC2 公网 IP 会变。

1. 左侧菜单 → **Elastic IPs** → **Allocate** → 点 **Allocate**
2. 选中刚分配的 IP → **Actions** → **Associate** → 选你的实例 → **Associate**

记下弹性 IP，后面一直用它。

### 安全组完整规则

| 类型       | 端口 | 来源      | 用途                     |
| ---------- | ---- | --------- | ------------------------ |
| SSH        | 22   | 0.0.0.0/0 | 远程连接                 |
| HTTP       | 80   | 0.0.0.0/0 | 网站                     |
| HTTPS      | 443  | 0.0.0.0/0 | 加密访问                 |
| 自定义 TCP | 3000 | 0.0.0.0/0 | **(Nginx 配好前临时用)** |
| 自定义 TCP | 3001 | 0.0.0.0/0 | **(Nginx 配好前临时用)** |
| 自定义 TCP | 3002 | 0.0.0.0/0 | **(Nginx 配好前临时用)** |

> ⚠️ 3000/3001/3002 配好 Nginx 后删掉，只留 22/80/443。
> ⚠️ PostgreSQL(5432) 和 Redis(6379) **永远不要**开放给公网。

---

## 2. SSH 连接 + 基础设置

### 2.1 本地 Mac 终端连接

```bash
# 设置密钥权限（重要！否则报 bad permissions）
chmod 400 ~/Downloads/hezhong666.pem

# SSH 连接
ssh -i ~/Downloads/hezhong666.pem ubuntu@你的弹性IP
```

> 第一次连接会问 `Are you sure?`，输入 `yes` 回车。

### 2.2 更新系统

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget unzip build-essential
```

---

## 3. 安装 Node.js / pnpm / PM2

### 3.1 安装 Node.js 22.x

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node -v   # 应显示 v22.x.x
npm -v
```

### 3.2 安装 pnpm

```bash
sudo npm install -g pnpm@9.15.0

# 验证
pnpm -v   # 应显示 9.15.0
```

### 3.3 安装 PM2

```bash
sudo npm install -g pm2

# 验证
pm2 -v
```

---

## 4. 安装 PostgreSQL + Redis

### 4.1 安装 PostgreSQL 16

```bash
sudo apt install -y postgresql postgresql-contrib

# 启动并设置开机自启
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 验证
sudo systemctl status postgresql | head -3
```

### 4.2 创建数据库和用户

```bash
# 设置密码（记牢这个密码，后面 .env 要用）
sudo -u postgres psql -c "CREATE USER forum WITH PASSWORD '换成强随机数据库密码';"
sudo -u postgres psql -c "CREATE DATABASE forum OWNER forum;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE forum TO forum;"
```

> 如果你之前已经创建过用户但忘了密码：
>
> ```bash
> sudo -u postgres psql -c "ALTER USER forum WITH PASSWORD '换成强随机数据库密码';"
> ```

### 4.3 安装数据库扩展

```bash
sudo -u postgres psql -d forum -c "CREATE EXTENSION IF NOT EXISTS citext;"
sudo -u postgres psql -d forum -c "CREATE EXTENSION IF NOT EXISTS ltree;"
sudo -u postgres psql -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### 4.4 安装 Redis

```bash
sudo apt install -y redis

# 启动并设置开机自启
sudo systemctl enable redis
sudo systemctl start redis

# 验证
redis-cli ping   # 应返回 PONG
```

---

## 5. 上传代码到服务器

> **不建议用 GitHub**，macOS 和 EC2 网络问题多。直接用 rsync 本地传。
>
> rsync 这里传的是完整项目源码，只排除不能从 Mac 覆盖到 EC2 的内容：
>
> - `apps/*/.env*`：生产密钥、数据库密码、SES/S3 配置只保存在服务器，不能被本地开发配置覆盖。
> - `node_modules`：Mac 和 Linux 的原生依赖不同，必须在 EC2 上 `pnpm install`。
> - `.next` / `dist`：构建产物要在 EC2 上用生产环境变量重新生成。
> - `.git`、`.pnpm-store`、`*.tsbuildinfo`：部署不需要。
>
> 如果新增源码文件没有出现在服务器，通常不是这些 exclude 导致的；用 `rsync --dry-run` 或 `ls ~/forum/...` 检查即可。

### 5.1 在 Mac 终端执行

```bash
# 先设置密钥权限（如果还没做过）
chmod 400 ~/Downloads/hezhong666.pem

# 传输代码（排除不需要的目录）
cd /Users/hezhong/Documents/Codex/浙工商树洞

rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '*.tsbuildinfo' \
  --exclude '.pnpm-store' \
  -e "ssh -i ~/Downloads/hezhong666.pem" \
  ./ ubuntu@54.46.126.41:~/forum/
```

> 传输时间约 1-3 分钟。

### 5.2 在 EC2 上验证

```bash
ls ~/forum/
# 应该看到: apps/ package.json pnpm-workspace.yaml 等
```

---

## 6. 安装项目依赖（避坑重点）

### 6.1 先加 Swap（防止 OOM 被杀）

> **这一步必须做！** t3.medium 只有 4GB 内存，pnpm 安装时会爆。

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 验证
free -h
# 应该看到: Swap: 4.0G

# 设置开机自动挂载
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 6.2 安装编译依赖（Prisma 需要）

```bash
sudo apt install -y openssl libssl-dev
```

### 6.3 安装依赖

```bash
cd ~/forum

# ⚠️ 用淘宝镜像源，npm 官方源香港直连很慢
pnpm install --registry https://registry.npmmirror.com
```

> 安装时间约 3-5 分钟。如果中途卡住（终端不动），按 Ctrl+C 取消，重新跑一次。

### 6.4 生成 Prisma Client

```bash
cd ~/forum
pnpm --filter @forum/api exec prisma generate
```

**如果报 `ENGINE_NOT_FOUND` 或 openssl 相关：**

```bash
# 先确保 openssl 装了
sudo apt install -y openssl libssl-dev

# 清理缓存重试
rm -rf apps/api/node_modules/.prisma
pnpm --filter @forum/api exec prisma generate
```

---

## 7. 配置环境变量

### 7.1 生成密钥

```bash
# 执行两次，得到两个不同的 64 字节 hex
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# ↑ 复制，这是 JWT_ACCESS_SECRET

node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# ↑ 复制，这是 ANON_SECRET
```

### 7.2 配置 API .env

```bash
cd ~/forum
nano apps/api/.env
```

粘贴以下内容（把 `你的弹性IP` 换成实际的）：

```env
NODE_ENV=production
APP_PORT=3000
APP_HOST=0.0.0.0
APP_BASE_URL=http://你的弹性IP
FRONTEND_ORIGIN=http://你的弹性IP
ALLOWED_EMAIL_DOMAIN=pop.zjgsu.edu.cn

DATABASE_URL=postgresql://forum:换成强随机数据库密码@localhost:5432/forum?schema=public
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=把刚才生成的第一个hex粘贴在这里
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000
ADMIN_TOTP_SECRET=把后台TOTP应用里的base32密钥粘贴在这里
ANON_SECRET=把刚才生成的第二个hex粘贴在这里

AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
S3_UPLOADS_BUCKET=placeholder
S3_AVATARS_BUCKET=placeholder
CDN_BASE_URL=http://你的弹性IP

MAIL_DRIVER=ses
MAIL_FROM=你在SES东京区域验证过的发件邮箱
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

IMAGE_MODERATION_ENABLED=false
LOG_LEVEL=info
LOG_PRETTY=false
RATE_LIMIT_TRUST_PROXY=true
```

> nano 操作：粘贴 → `Ctrl+X` → `Y` → 回车

### 7.3 配置 Web .env

```bash
cat > apps/web/.env << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=https://manage.unidating.top
NEXT_PUBLIC_APP_NAME=浙工商树洞
NEXT_PUBLIC_USE_MOCK=false
EOF
```

> `NEXT_PUBLIC_API_URL=http://localhost:3000` 只给 Next.js 服务端 rewrite 使用。浏览器端代码会自动走同源 `/api`，不会访问用户电脑的 localhost。

### 7.4 配置 Admin .env

```bash
cat > apps/admin/.env << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WEB_URL=https://unidating.top
NEXT_PUBLIC_ADMIN_URL=https://manage.unidating.top
NEXT_PUBLIC_APP_NAME=浙工商树洞·后台
NEXT_PUBLIC_USE_MOCK=false
EOF
```

> 如果管理后台登录时报 `Failed to fetch`，先确认已经用最新代码重新 build；新版前端会把浏览器端请求发到 `https://manage.unidating.top/api/...`，再由 Next.js rewrite 转发到 EC2 本机 API。

---

## 8. 数据库建表

### 8.1 确认数据库可连接

```bash
# 用你在 .env 里配的密码测试
PGPASSWORD=换成强随机数据库密码 psql -h localhost -U forum -d forum -c "SELECT 1;"
# 应输出: ?column? → 1
```

### 8.2 建表 / 迁移

```bash
cd ~/forum
pnpm --filter @forum/api exec prisma migrate deploy
```

> 如果你的现网数据库之前是用 `db push` 创建的，`migrate deploy` 会报 `P3005`。先备份数据库，再执行下面的首次 baseline 步骤；之后统一使用 `migrate deploy`，不要在生产环境继续使用 `db push`。

### 8.2.1 首次从 db push 切换到 migrate

只在第一次遇到 `P3005 The database schema is not empty` 时执行：

```bash
cd ~/forum/apps/api

# 先备份
pg_dump "$DATABASE_URL" > ~/forum-before-migrate-baseline-$(date +%F-%H%M%S).sql

# 手动执行当前这几条幂等 migration，让数据库结构补齐
pnpm exec prisma db execute --file prisma/migrations/202605270001_direct_messages/migration.sql --schema prisma/schema.prisma
pnpm exec prisma db execute --file prisma/migrations/202605270002_sensitive_words_admin/migration.sql --schema prisma/schema.prisma
pnpm exec prisma db execute --file prisma/migrations/202605270003_system_announcements/migration.sql --schema prisma/schema.prisma

# 告诉 Prisma：这些 migration 已经应用过
pnpm exec prisma migrate resolve --applied 202605270000_init
pnpm exec prisma migrate resolve --applied 202605270001_direct_messages
pnpm exec prisma migrate resolve --applied 202605270002_sensitive_words_admin
pnpm exec prisma migrate resolve --applied 202605270003_system_announcements

# 之后应显示没有待执行 migration
pnpm exec prisma migrate deploy
```

**如果报 `P1001: Can't reach database server`：**

```bash
# 检查 PostgreSQL 是否运行
sudo systemctl status postgresql
sudo ss -tlnp | grep 5432
```

### 8.3 执行 post-migrate SQL

```bash
DATABASE_URL="postgresql://forum:换成强随机数据库密码@localhost:5432/forum?schema=public" \
  pnpm --filter @forum/api exec prisma db execute \
  --file prisma/sql/post-migrate.sql \
  --schema prisma/schema.prisma
```

### 8.4 验证表是否建好

```bash
sudo -u postgres psql -d forum -c "\dt"
# 应看到: users, posts, comments, boards, registration_requests 等
```

### 8.5 填充种子数据（可选）

```bash
cd ~/forum
DATABASE_URL="postgresql://forum:换成强随机数据库密码@localhost:5432/forum?schema=public" \
  npx tsx apps/api/prisma/seed.ts
```

---

## 9. 构建所有应用

### 9.1 构建 API

```bash
cd ~/forum
pnpm --filter @forum/api build
```

### 9.2 构建 Web

```bash
pnpm --filter @forum/web build
```

### 9.3 构建 Admin

```bash
pnpm --filter @forum/admin build
```

### 9.4 如果构建报 `@/data/mock` 找不到

```bash
# 检查 mock 文件是否存在
ls -la apps/admin/src/data/mock.ts
ls -la apps/web/src/data/mock.ts

# 如果不存在，说明 rsync 时漏了，重新 rsync
# 或者手动创建目录并写入（见附录 B）
```

---

## 10. PM2 启动进程

### 10.1 启动 API

```bash
cd ~/forum
pm2 start dist/main.js --name "forum-api" --cwd ~/forum/apps/api

# 验证
curl http://localhost:3000/healthz
# 应返回: {"status":"ok","timestamp":"..."}

curl http://localhost:3000/readyz
# 应返回: {"status":"ok","components":{"database":{"status":"up"},"redis":{"status":"up"}}}
```

**如果 readyz 显示 database 或 redis 不可用：**

```bash
# 检查数据库
sudo systemctl status postgresql
redis-cli ping

# 检查 .env 里的 DATABASE_URL 和 REDIS_URL
cat ~/forum/apps/api/.env | grep -E "DATABASE_URL|REDIS_URL"
```

### 10.2 启动 Web

```bash
cd ~/forum
pm2 start apps/web/node_modules/.bin/next --name "forum-web" -- start apps/web -p 3001
```

> ⚠️ 注意路径是 `apps/web/node_modules/.bin/next`，不是 `node_modules/.bin/next`。
> 因为在 monorepo 里，next 安装在子项目的 node_modules 下。

### 10.3 启动 Admin

```bash
cd ~/forum
pm2 start apps/admin/node_modules/.bin/next --name "forum-admin" -- start apps/admin -p 3002
```

### 10.4 验证三个进程都 online

```bash
pm2 status
```

预期输出：

```
┌────┬──────────────┬──────────┬────────┬──────────┐
│ id │ name         │ status   │ cpu    │ mem      │
├────┼──────────────┼──────────┼────────┼──────────┤
│ 0  │ forum-api    │ online   │ 0%     │ 80MB     │
│ 1  │ forum-web    │ online   │ 0.1%   │ 90MB     │
│ 2  │ forum-admin  │ online   │ 0.1%   │ 85MB     │
└────┴──────────────┴──────────┴────────┴──────────┘
```

### 10.5 设置开机自启

```bash
pm2 startup
# 按提示复制粘贴那条 sudo 命令
# 例如: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

pm2 save
```

### 10.6 本地验证（不用浏览器）

Nginx 配好之前，用 `curl` 在 EC2 内部测试就行：

```bash
# 测试 API
curl http://localhost:3000/healthz
# {"status":"ok","timestamp":"..."}

# 测试 Web
curl -s http://localhost:3001 | head -5
# 应返回 HTML 内容，不是报错

# 测试 Admin
curl -s http://localhost:3002 | head -5
# 应返回 HTML 内容，不是报错
```

---

## 11. Nginx 反向代理

### 11.1 安装 Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 11.2 配置站点

```bash
sudo nano /etc/nginx/sites-available/forum
```

粘贴以下内容（**不用改任何东西**，直接复制粘贴）：

```nginx
server {
    listen 80;
    server_name _;   # 匹配任意域名/IP

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> `server_name _;` 的意思是「接受任何访问」，不管是用 IP 还是域名都能用。

### 11.3 启用站点

```bash
sudo ln -sf /etc/nginx/sites-available/forum /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 11.4 验证

浏览器打开 `http://你的弹性IP`（不带端口），应该看到论坛页面。

**如果 502 Bad Gateway：**

```bash
pm2 status        # 检查 forum-web 是否 online
pm2 logs forum-web --lines 20  # 看日志
```

### 11.5 管理后台访问

管理后台跑在 `localhost:3002`。添加 Nginx 子域名：

```bash
sudo nano /etc/nginx/sites-available/forum
```

在文件末尾添加第二个 server block。配置 HTTPS 前可先用 80 端口反代；Certbot 配好证书后，把 80 端口改成跳转到 HTTPS，443 端口负责反代：

```nginx
server {
    listen 80;
    server_name manage.unidating.top;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name manage.unidating.top;

    ssl_certificate /etc/letsencrypt/live/unidating.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/unidating.top/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

然后在阿里云 DNS 添加 A 记录：`manage` → 你的弹性IP。DNS 生效并配置 HTTPS 后访问 `https://manage.unidating.top`。

如果 `sudo nginx -T` 里出现另一个 `server_name manage.unidating.top; return 404; # managed by Certbot`，删除或改成上面的 301 跳转；否则 HTTP 访问会被这个 Certbot 占位 server 拦截成 404。

如果 `manage.unidating.top` 打开是 404：

```bash
curl -I http://127.0.0.1:3002
sudo nginx -T | grep -A20 'server_name manage.unidating.top'
sudo nginx -t
sudo systemctl reload nginx
```

如果 `curl -I http://127.0.0.1:3002` 不是 200/307，先看 `pm2 logs forum-admin --lines 80 --nostream`；如果本机 3002 正常但域名 404，就是 Nginx 的 `server_name manage.unidating.top` 没生效或 DNS 没指到这台 EC2。

管理员账号来自数据库中 `role=admin` 的用户；不要在生产环境使用硬编码后台账号。

---

## 12. 配置域名 + HTTPS

### 12.1 阿里云 DNS 配置

在阿里云 DNS 控制台添加：

| 记录类型 | 主机记录 | 记录值     |
| -------- | -------- | ---------- |
| A        | @        | 你的弹性IP |
| A        | www      | 你的弹性IP |
| A        | manage   | 你的弹性IP |

> DNS 生效需 5-15 分钟。

### 12.2 更新 Nginx 域名

```bash
sudo nano /etc/nginx/sites-available/forum
```

把 `server_name _;` 改为 `server_name unidating.top www.unidating.top;`

### 12.3 SSL 证书

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d unidating.top -d www.unidating.top -d manage.unidating.top
```

---

## 13. 日常维护

### 13.1 查看状态

```bash
pm2 status                    # 进程状态
pm2 logs forum-api --lines 20 # 看 API 日志
pm2 logs forum-web --lines 20 # 看 Web 日志
```

### 13.2 重启服务

```bash
pm2 restart all               # 重启所有
pm2 restart forum-api         # 只重启 API
```

### 13.3 更新代码

```bash
# 在本地 Mac 的项目根目录执行，不要覆盖服务器上的 .env
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude 'apps/api/.env' \
  --exclude 'apps/web/.env' \
  --exclude 'apps/admin/.env' \
  -e "ssh -i ~/Downloads/hezhong666.pem" \
  ./ ubuntu@43.199.106.27:~/forum/
```

这条命令会覆盖服务器上的项目源码，但会保留生产 `.env`、依赖目录和构建产物。更新后必须在服务器重新 `pnpm install`、迁移、检查和 `pnpm build`；如果 build 失败，不要执行 `pm2 restart all`。

```bash
# SSH 进入 EC2
ssh -i ~/Downloads/hezhong666.pem ubuntu@你的EC2公网IP

cd ~/forum

# 备份数据库（每次上线前做）
pg_dump "$DATABASE_URL" > ~/forum-backup-$(date +%F-%H%M%S).sql

# 确保生产构建不用 mock；如果 .env 里残留 true，会直接构建失败
for f in apps/web/.env apps/web/.env.local apps/web/.env.production apps/admin/.env apps/admin/.env.local apps/admin/.env.production; do
  if [ -f "$f" ]; then
    grep -q '^NEXT_PUBLIC_USE_MOCK=' "$f" && sed -i 's/^NEXT_PUBLIC_USE_MOCK=.*/NEXT_PUBLIC_USE_MOCK=false/' "$f" || echo 'NEXT_PUBLIC_USE_MOCK=false' >> "$f"
  fi
done
export NEXT_PUBLIC_USE_MOCK=false

pnpm install --frozen-lockfile
pnpm --filter @forum/api prisma:generate
pnpm --filter @forum/api prisma:migrate:deploy
pnpm --filter @forum/api prisma:post-migrate
pnpm typecheck
pnpm lint:check
pnpm build
test -f apps/api/dist/main.js
pm2 restart all --update-env
pm2 status
curl http://127.0.0.1:3000/healthz
```

> 如果 `pm2 status` 里 `forum-api` 重启次数持续增加、`curl 127.0.0.1:3000/healthz` 连不上，通常是 API 进程没有在 `~/forum/apps/api` 目录启动，导致运行时读不到 `apps/api/.env`。执行：
>
> ```bash
> pm2 delete forum-api
> cd ~/forum
> pnpm --filter @forum/api build
> test -f apps/api/dist/main.js
> pm2 start dist/main.js --name forum-api --cwd ~/forum/apps/api --update-env
> pm2 logs forum-api --lines 80 --nostream
> curl http://127.0.0.1:3000/healthz
> ```

本次生产化改造包含私信表、敏感词管理字段、系统通知公告表等 Prisma migration；上线前务必先备份数据库，`migrate deploy` 成功后再构建和重启。

如果上线后异常，先看日志：`pm2 logs forum-api --lines 100`、`pm2 logs forum-web --lines 100`。需要快速回滚时，把上一版代码重新 `rsync` 到服务器，再重新 build 并 `pm2 restart all`。

### 13.4 查看内存

```bash
free -h
# 如果内存不够，可以先停掉管理后台
pm2 stop forum-admin
```

---

## 14. 从零重装（服务器状态混乱时用）

如果 PM2、Nginx、`.env`、Prisma baseline 已经被多轮调试弄乱，直接按本节从零重装。这个流程会删除服务器上的项目目录和 PM2 进程；数据库默认也重建为空库。执行前先确认你接受清空现网数据。

### 14.1 停服务并清理旧项目

```bash
# EC2 上执行
pm2 delete all || true
pm2 save --force || true

sudo rm -f /etc/nginx/sites-enabled/forum
sudo rm -f /etc/nginx/sites-available/forum
sudo nginx -t && sudo systemctl reload nginx || true

# 如果旧项目还能读到 .env，先备份一份
mkdir -p ~/forum-backups
if [ -f ~/forum/apps/api/.env ]; then
  cp ~/forum/apps/api/.env ~/forum-backups/api.env.$(date +%F-%H%M%S)
fi

rm -rf ~/forum
mkdir -p ~/forum
```

### 14.2 重建数据库（清空数据）

```bash
# EC2 上执行。把密码换成强随机密码，后面 apps/api/.env 里也要用同一个。
DB_PASSWORD='换成强随机数据库密码'

sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'forum';"
sudo -u postgres dropdb --if-exists forum
sudo -u postgres dropuser --if-exists forum
sudo -u postgres psql -c "CREATE USER forum WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres createdb -O forum forum
sudo -u postgres psql -d forum -c "CREATE EXTENSION IF NOT EXISTS citext;"
sudo -u postgres psql -d forum -c "CREATE EXTENSION IF NOT EXISTS ltree;"
sudo -u postgres psql -d forum -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### 14.3 从 Mac 全量上传源码

这里传的是完整源码，但仍然不传 Mac 的依赖、构建产物、Git 仓库和本地 `.env`。这些内容必须在 EC2 上重新生成，否则会出现 Mac/Linux 依赖不兼容、生产密钥被覆盖、构建环境不一致等问题。

```bash
# Mac 本地执行
cd /Users/hezhong/Documents/Codex/浙工商树洞

rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '.pnpm-store' \
  --exclude 'apps/api/.env' \
  --exclude 'apps/api/.env.*' \
  --exclude 'apps/web/.env' \
  --exclude 'apps/web/.env.*' \
  --exclude 'apps/admin/.env' \
  --exclude 'apps/admin/.env.*' \
  -e "ssh -i ~/Downloads/hezhong666.pem" \
  ./ ubuntu@18.162.112.100:~/forum/
```

### 14.4 重新生成生产 `.env`

```bash
# EC2 上执行
cd ~/forum

JWT_ACCESS_SECRET=$(openssl rand -hex 64)
ANON_SECRET=$(openssl rand -hex 64)
ADMIN_TOTP_SECRET=$(node -e "const crypto=require('crypto');const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let s='';for(const b of crypto.randomBytes(32))s+=a[b&31];console.log(s)")

echo "后台 TOTP 密钥，请立刻加到手机验证器：$ADMIN_TOTP_SECRET"
```

```bash
cat > apps/api/.env << EOF
NODE_ENV=production
APP_PORT=3000
APP_HOST=0.0.0.0
APP_BASE_URL=https://unidating.top
FRONTEND_ORIGIN=https://unidating.top
ADMIN_ORIGIN=https://manage.unidating.top
ALLOWED_EMAIL_DOMAIN=pop.zjgsu.edu.cn

DATABASE_URL=postgresql://forum:换成强随机数据库密码@localhost:5432/forum?schema=public
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000
ADMIN_TOTP_SECRET=$ADMIN_TOTP_SECRET
ANON_SECRET=$ANON_SECRET

AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
S3_UPLOADS_BUCKET=unidating-uploads
S3_AVATARS_BUCKET=unidating-avatars
CDN_BASE_URL=https://unidating.top

MAIL_DRIVER=ses
MAIL_FROM=no-reply@unidating.top
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

IMAGE_MODERATION_ENABLED=false
LOG_LEVEL=info
LOG_PRETTY=false
RATE_LIMIT_TRUST_PROXY=true
EOF
```

把 `DATABASE_URL` 里的数据库密码改成第 14.2 节的 `DB_PASSWORD`，把 `MAIL_FROM` 改成 SES 东京区域已经验证过的发件邮箱。没有配 S3/CloudFront 前，图片上传功能会受影响，但不影响服务启动。

```bash
cat > apps/web/.env << 'EOF'
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
NEXT_PUBLIC_ADMIN_URL=https://manage.unidating.top
NEXT_PUBLIC_APP_NAME=浙工商树洞
NEXT_PUBLIC_USE_MOCK=false
EOF

cat > apps/admin/.env << 'EOF'
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
NEXT_PUBLIC_WEB_URL=https://unidating.top
NEXT_PUBLIC_ADMIN_URL=https://manage.unidating.top
NEXT_PUBLIC_APP_NAME=浙工商树洞·后台
NEXT_PUBLIC_USE_MOCK=false
EOF
```

### 14.5 安装、迁移、构建

```bash
cd ~/forum

pnpm install --frozen-lockfile
pnpm --filter @forum/api prisma:generate
pnpm --filter @forum/api prisma:migrate:deploy
pnpm --filter @forum/api prisma:post-migrate
pnpm typecheck
pnpm lint:check
pnpm build

test -f apps/api/dist/main.js
```

### 14.6 用 PM2 重新启动三端

用 `pnpm start` 并设置 `cwd`，这样每个应用都会读取自己目录下的 `.env`。

```bash
cd ~/forum

pm2 delete all || true
pm2 start pnpm --name forum-api --cwd /home/ubuntu/forum/apps/api -- start
pm2 start pnpm --name forum-web --cwd /home/ubuntu/forum/apps/web -- start
pm2 start pnpm --name forum-admin --cwd /home/ubuntu/forum/apps/admin -- start
pm2 save

curl http://127.0.0.1:3000/healthz
curl -I http://127.0.0.1:3001
curl -I http://127.0.0.1:3002
```

### 14.7 重建 Nginx 配置

```bash
sudo tee /etc/nginx/sites-available/forum > /dev/null << 'EOF'
server {
    listen 80;
    server_name unidating.top www.unidating.top manage.unidating.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name unidating.top www.unidating.top;

    ssl_certificate /etc/letsencrypt/live/unidating.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/unidating.top/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 443 ssl;
    server_name manage.unidating.top;

    ssl_certificate /etc/letsencrypt/live/unidating.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/unidating.top/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;
    }

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/forum /etc/nginx/sites-enabled/forum
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

如果证书还没签发，先临时只用 80 端口反代；DNS 指向 EC2 后再执行：

```bash
sudo certbot --nginx -d unidating.top -d www.unidating.top -d manage.unidating.top
```

### 14.8 最终验收

```bash
pm2 status
curl http://127.0.0.1:3000/healthz
curl -Ik https://unidating.top
curl -Ik https://manage.unidating.top
pm2 logs forum-api --lines 50 --nostream
```

浏览器验收：

- `https://unidating.top` 未登录应进入登录页。
- `https://manage.unidating.top` 应进入后台登录页。
- 后台登录必须填写管理员账号密码和手机验证器里的 6 位 TOTP。

---

## 15. 附录：常见报错速查

| 症状                                          | 原因                             | 解法                                            |
| --------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| SSH: `bad permissions`                        | .pem 权限太大                    | `chmod 400 ~/Downloads/hezhong666.pem`          |
| `pnpm install` 极慢                           | 连 npm 官方源慢                  | 加 `--registry https://registry.npmmirror.com`  |
| `Killed`                                      | 内存不足 OOM                     | 先加 swap（第 6.1 节）                          |
| `prisma: command not found`                   | Prisma 没装                      | `pnpm --filter @forum/api exec prisma generate` |
| `prisma migrate deploy` 找不到文件            | 现网曾用 `db push` 且未 baseline | 先备份数据库并建立 Prisma baseline              |
| `ENGINE_NOT_FOUND`                            | 缺 openssl                       | `sudo apt install -y openssl libssl-dev`        |
| `@/data/mock` 找不到                          | mock 文件没在 git 里             | rsync 时确认包含 `apps/*/src/data/`             |
| `.env` validation error                       | .env 文件不完整                  | 复制第 7.2 节的完整内容                         |
| `node_modules/.bin/next` 找不到               | monorepo 路径不同                | 用 `apps/web/node_modules/.bin/next`            |
| 502 Bad Gateway                               | 后端没启动                       | `pm2 status` 检查，`pm2 logs` 看日志            |
| 浏览器打不开                                  | 安全组没开端口 `80`              | AWS 控制台放行 HTTP(80) 和 HTTPS(443)           |
| Config validation error                       | .env 必填项缺失                  | 检查 `cat apps/api/.env` 是否有空值             |
| `psql: FATAL: password authentication failed` | 数据库密码不对                   | `ALTER USER forum WITH PASSWORD '...'`          |

### PM2 常用命令

```bash
pm2 status          # 进程状态
pm2 logs            # 看全部日志
pm2 logs forum-api  # 只看 API 日志
pm2 restart all     # 重启全部
pm2 stop forum-admin  # 停掉管理后台
pm2 delete forum-admin # 从 PM2 移除
pm2 monit           # 实时监控面板
pm2 save            # 保存当前进程列表
```

### 查看系统服务

```bash
sudo systemctl status postgresql
sudo systemctl status redis
sudo systemctl status nginx
```

### 日常操作

| 场景           | 命令                                       |
| -------------- | ------------------------------------------ |
| 重启全部       | `pm2 restart ecosystem.config.js`          |
| 只重启 Web     | `pm2 restart forum-web`                    |
| 更新代码后重启 | 构建完成后执行 `pm2 restart all`           |
| EC2 重启后恢复 | PM2 已保存进程列表，通常不用手动处理       |
| 看谁挂了       | `pm2 status`                               |
| 看 Web 报错    | `pm2 logs forum-web --lines 50 --nostream` |
