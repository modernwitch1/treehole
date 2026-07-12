import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { Prisma, PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

if (existsSync('.env')) {
  loadEnvFile('.env');
}

const prisma = new PrismaClient();

function usage(): never {
  throw new Error(
    '用法: pnpm --filter @forum/api superadmin:transfer -- --from <当前超管用户名> --to <目标管理员用户名> --confirm <目标管理员用户名>',
  );
}

function readArguments(): { from: string; to: string } {
  const args = process.argv.slice(2);
  if (args[0] === '--') {
    args.shift();
  }
  const allowed = new Set(['--from', '--to', '--confirm']);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1]?.trim();
    if (!key || !allowed.has(key) || !value || values.has(key)) {
      usage();
    }
    values.set(key, value);
  }
  if (args.length !== 6) {
    usage();
  }
  const from = values.get('--from');
  const to = values.get('--to');
  const confirmation = values.get('--confirm');
  if (!from || !to || !confirmation || confirmation !== to) {
    usage();
  }
  for (const username of [from, to]) {
    if (username.length > 50 || /[\u0000-\u001f\u007f]/.test(username)) {
      throw new Error('用户名格式无效');
    }
  }
  if (from.toLocaleLowerCase() === to.toLocaleLowerCase()) {
    throw new Error('当前超级管理员和目标管理员不能是同一账号');
  }
  return { from, to };
}

async function revokeAdminSessions(redis: Redis, userIds: string[]): Promise<number> {
  const owners = new Set(userIds);
  let cursor = '0';
  let revoked = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'admin-session:*', 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length === 0) {
      continue;
    }
    const values = await redis.mget(keys);
    const ownedKeys = keys.filter((_, index) => {
      const owner = values[index];
      return owner !== null && owners.has(owner);
    });
    if (ownedKeys.length > 0) {
      revoked += await redis.del(...ownedKeys);
    }
  } while (cursor !== '0');
  return revoked;
}

async function main(): Promise<void> {
  const { from, to } = readArguments();
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('缺少 REDIS_URL，无法安全撤销管理后台会话');
  }
  const redis = new Redis(redisUrl, {
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    await redis.ping();
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('zjgsu-superadmin-transfer'))`;

        const currentOwners = await tx.user.findMany({
          where: { role: 'superadmin' },
          take: 2,
          select: { id: true, username: true },
        });
        if (currentOwners.length !== 1) {
          throw new Error(`转移前必须恰好存在一个超级管理员，当前数量为 ${currentOwners.length}`);
        }
        const currentOwner = currentOwners[0];
        if (currentOwner.username.toLocaleLowerCase() !== from.toLocaleLowerCase()) {
          throw new Error('当前超级管理员与 --from 不一致，已拒绝转移');
        }

        const target = await tx.user.findUnique({
          where: { username: to },
          select: {
            id: true,
            username: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            deletedAt: true,
          },
        });
        if (!target) {
          throw new Error('目标管理员不存在');
        }
        if (
          target.role !== 'admin' ||
          target.status !== 'active' ||
          target.deletedAt ||
          !target.emailVerifiedAt
        ) {
          throw new Error('目标账号必须是已验证、未删除且状态正常的 admin');
        }

        const demoted = await tx.user.updateMany({
          where: { id: currentOwner.id, role: 'superadmin' },
          data: { role: 'admin' },
        });
        if (demoted.count !== 1) {
          throw new Error('旧超级管理员状态已变化，转移已回滚');
        }
        const promoted = await tx.user.updateMany({
          where: { id: target.id, role: 'admin', status: 'active', deletedAt: null },
          data: { role: 'superadmin' },
        });
        if (promoted.count !== 1) {
          throw new Error('目标管理员状态已变化，转移已回滚');
        }

        const revokedSessions = await revokeAdminSessions(redis, [
          String(currentOwner.id),
          String(target.id),
        ]);
        await tx.auditLog.create({
          data: {
            actorId: currentOwner.id,
            action: 'superadmin.transfer',
            targetType: 'user',
            targetId: target.id,
            metadata: {
              source: 'maintenance-cli',
              fromUserId: String(currentOwner.id),
              fromUsername: currentOwner.username,
              toUserId: String(target.id),
              toUsername: target.username,
              revokedAdminSessions: revokedSessions,
            },
          },
        });
        return {
          from: currentOwner.username,
          fromId: String(currentOwner.id),
          to: target.username,
          toId: String(target.id),
          revokedSessions,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
    // Close the narrow window in which an old-role session could have been
    // issued while the database transaction was still committing.
    const additionallyRevoked = await revokeAdminSessions(redis, [result.fromId, result.toId]);
    process.stdout.write(
      `超级管理员已从 ${result.from} 转移至 ${result.to}；已撤销 ${result.revokedSessions + additionallyRevoked} 个后台会话。\n`,
    );
  } finally {
    await Promise.allSettled([redis.quit(), prisma.$disconnect()]);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`超级管理员转移失败：${message}\n`);
  process.exitCode = 1;
});
