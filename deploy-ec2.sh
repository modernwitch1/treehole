#!/bin/bash
# ============================================================
# 浙工商树洞 — EC2 (Ubuntu 24.04 LTS) 部署脚本
# 用法: 逐段复制到 EC2 终端执行
# ============================================================
set -euo pipefail

# ============================================================
# 1. 系统依赖安装
# ============================================================

# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y git nginx curl gnupg lsb-release ca-certificates

# 安装与 .nvmrc、CI 一致的 Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node -v          # >= 22
npm -v

# 安装 pnpm
sudo npm install -g pnpm@9.15.0
pnpm -v          # 9.15.0

# 安装 PM2
sudo npm install -g pm2
pm2 -v

echo "✅ 基础依赖安装完成"

# ============================================================
# 2. PostgreSQL 16 安装
# ============================================================

# Ubuntu 24.04 官方源自带 PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# 查看安装状态
sudo systemctl status postgresql || true

# 创建 forum 数据库和用户
FORUM_DB_PASSWORD="forum_prod_password_change_me"
sudo -u postgres psql -c "CREATE USER forum WITH PASSWORD '${FORUM_DB_PASSWORD}';"
sudo -u postgres psql -c "CREATE DATABASE forum OWNER forum;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE forum TO forum;"

# 修改 pg_hba.conf 允许密码登录（md5）
PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" | tr -d ' ')
sudo sed -i 's/^local\s\+all\s\+all\s\+peer/local   all             all                                     md5/' "$PG_HBA"
sudo sed -i 's/^host\s\+all\s\+all\s\+127.0.0.1\/32\s\+scram-sha-256/host    all             all             127.0.0.1\/32            md5/' "$PG_HBA"

# 重启 postgresql 使配置生效
sudo systemctl restart postgresql

echo "✅ PostgreSQL 安装完成，数据库 forum 已创建"

# ============================================================
# 3. Redis 7 安装
# ============================================================

# Ubuntu 24.04 自带 Redis 7.x
sudo apt install -y redis

# 配置 Redis — 只绑定本地
sudo sed -i 's/^bind 127.0.0.1 ::1/bind 127.0.0.1/' /etc/redis/redis.conf
sudo sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf

sudo systemctl enable redis
sudo systemctl start redis

echo "✅ Redis 安装完成"

# ============================================================
# 4. 克隆项目并配置环境变量
# ============================================================

cd /home/ubuntu
# ⚠️ 如果还没 clone，先执行:
#   git clone https://github.com/modernwitch1/zjgsu-treehole.git
cd zjgsu-treehole

# 生成生产环境 .env —— API
# ⚠️ 手动修改密钥和凭证
cat > apps/api/.env << 'APIEVEOF'
NODE_ENV=production
APP_PORT=3000
APP_HOST=0.0.0.0
APP_BASE_URL=https://unidating.top
FRONTEND_ORIGIN=https://unidating.top
ADMIN_ORIGIN=https://admin.unidating.top
MERCHANT_ORIGIN=https://merchant.unidating.top
ALLOWED_EMAIL_DOMAIN=pop.zjgsu.edu.cn

DATABASE_URL=postgresql://forum:forum_prod_password_change_me@localhost:5432/forum?schema=public

REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=replace_me_with_64_random_bytes_hex
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000
ADMIN_TOTP_SECRET=replace_me_with_admin_totp_base32_secret

ANON_SECRET=replace_me_with_64_random_bytes_hex

AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
S3_UPLOADS_BUCKET=你的-uploads-bucket
S3_AVATARS_BUCKET=你的-avatars-bucket
CDN_BASE_URL=https://你的cdn域名或s3域名

MAIL_DRIVER=ses
MAIL_FROM=你在SES东京区域验证过的发件邮箱

IMAGE_MODERATION_ENABLED=false

SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1

LOG_LEVEL=info
LOG_PRETTY=false

RATE_LIMIT_TRUST_PROXY=true
APIEVEOF

# Web 前端 .env
cat > apps/web/.env << 'WEBEVEOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=https://admin.unidating.top
NEXT_PUBLIC_APP_NAME=浙工商树洞
NEXT_PUBLIC_USE_MOCK=false
WEBEVEOF

# Admin 后台 .env
cat > apps/admin/.env << 'ADMINEVEOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WEB_URL=https://unidating.top
NEXT_PUBLIC_ADMIN_URL=https://admin.unidating.top
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_APP_NAME=浙工商树洞·后台
ADMINEVEOF

# 商家独立后台 .env
cat > apps/merchant/.env << 'MERCHANTEVEOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_APP_NAME=浙工商树洞·商家后台
MERCHANTEVEOF

echo "✅ 环境变量文件已生成"
echo "⚠️  重要: 现在编辑 apps/api/.env 替换所有 replace_me 和占位值！"
echo "   运行: nano apps/api/.env"

# 等待用户确认
read -p "环境变量编辑完成后，按 Enter 继续..."

# ============================================================
# 5. 安装依赖、构建、数据库迁移
# ============================================================

# 安装依赖
pnpm install --frozen-lockfile

# Prisma 生成客户端
pnpm --filter @forum/api prisma:generate

# 构建所有包
pnpm build

# 运行数据库迁移和 Prisma 无法表达的幂等 PostgreSQL 约束/索引
pnpm db:migrate:deploy

# 可选：填充种子数据
# pnpm --filter @forum/api db:seed

echo "✅ 构建完成，数据库迁移已执行"

# ============================================================
# 6. PM2 配置
# ============================================================

cd /home/ubuntu/zjgsu-treehole

# 使用仓库内统一的 PM2 配置，避免部署文档和脚本的启动参数漂移。
mkdir -p logs
pm2 startOrReload ecosystem.config.cjs --env production

# 构建会替换 .next/dist 产物；必须显式重启正在运行的 Next.js 进程，
# 让内存中的 build manifest 与磁盘上的静态 chunk 保持同一版本。
pm2 restart forum-api --update-env
pm2 restart forum-web --update-env
pm2 restart forum-admin --update-env
pm2 restart forum-merchant --update-env

# 保存 PM2 进程列表
pm2 save

# 设置开机自启
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo "✅ PM2 进程已启动"

# 查看状态
pm2 status

# ============================================================
# 7. Nginx 反向代理配置
# ============================================================

cat > /tmp/forum-rate-limit.conf << 'NGINXRATEEOF'
limit_req_zone $binary_remote_addr zone=admin_login:10m rate=10r/m;
NGINXRATEEOF
sudo mv /tmp/forum-rate-limit.conf /etc/nginx/conf.d/forum-rate-limit.conf

cat > /tmp/forum.conf << 'NGINXEOF'
server {
    listen 80;
    server_name unidating.top www.unidating.top;

    # 前端 + API 代理 (Next.js rewrites 会把 /api/* 转到 localhost:3000)
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

        client_max_body_size 50m;
    }
}

server {
    listen 80;
    server_name admin.unidating.top;

    # 只限制登录接口，不限制管理后台静态资源和普通 API 请求。
    location = /api/v1/admin/auth/login {
        limit_req zone=admin_login burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
        client_max_body_size 20m;
    }
}

server {
    listen 80;
    server_name merchant.unidating.top;

    # 商家后台独立端口；DNS 和 HTTPS 证书配置完成后再改为 HTTPS 跳转。
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 20m;
    }
}
NGINXEOF

sudo mv /tmp/forum.conf /etc/nginx/sites-available/forum
sudo ln -sf /etc/nginx/sites-available/forum /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 首次安装只写 HTTP 配置，确保在证书尚不存在时 nginx -t 也能通过。
# 后续 certbot --nginx 会自动补充 HTTPS 证书和重定向。
sudo nginx -t

# 启动 Nginx
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "✅ Nginx 配置完成"
echo ""
echo "========== 接下来手动操作 =========="
echo "1. ⚠️  务必编辑 apps/api/.env 替换所有密钥"
echo "2. 在 AWS 创建 S3 buckets（uploads + avatars）"
echo "3. 配置 SES 邮箱 (或先用 SMTP 调试)"
echo "4. 域名 DNS 指向 EC2 公网 IP"
echo "5. 配置 SSL:"
echo "   sudo apt install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d unidating.top -d www.unidating.top -d admin.unidating.top -d merchant.unidating.top"
echo "6. AWS 安全组放开 80, 443 端口"
echo "7. EC2 安全组 -> 只保留 22, 80, 443"
echo "===================================="
