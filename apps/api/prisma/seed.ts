// 浙工商校园论坛 — 数据库种子
// 用法: pnpm db:seed
// 注意: 仅在开发/演示环境运行, 生产环境请勿执行

import { PrismaClient, SensitiveAction, SensitiveCategory, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding initial boards…');

  const boards = [
    {
      slug: 'zheng-neng-liang',
      name: '正能量',
      description: '校内新鲜事、活动公告、正能量分享',
      icon: '🏫',
      color: 'blue',
      allowsAnonymous: true,
      sortOrder: 10,
    },
    {
      slug: 'campus',
      name: '校园生活',
      description: '校园日常、学习生活、趣事分享',
      icon: '📚',
      color: 'green',
      allowsAnonymous: true,
      sortOrder: 20,
    },
    {
      slug: 'course',
      name: '选课交流',
      description: '选课推荐、课程评价、学习经验',
      icon: '💬',
      color: 'teal',
      allowsAnonymous: true,
      sortOrder: 30,
    },
    {
      slug: 'trade',
      name: '二手交易',
      description: '闲置物品买卖、求购信息',
      icon: '🛒',
      color: 'amber',
      allowsAnonymous: false,
      sortOrder: 40,
    },
    {
      slug: 'job',
      name: '实习就业',
      description: '实习招聘、求职经验、内推信息',
      icon: '💼',
      color: 'purple',
      allowsAnonymous: false,
      sortOrder: 50,
    },
    {
      slug: 'emotion',
      name: '情感天地',
      description: '倾诉、树洞、情感话题',
      icon: '❤️',
      color: 'pink',
      allowsAnonymous: true,
      sortOrder: 60,
    },
    {
      slug: 'exam',
      name: '考研考公',
      description: '考研/考公/考证经验交流',
      icon: '📖',
      color: 'indigo',
      allowsAnonymous: true,
      sortOrder: 70,
    },
    {
      slug: 'feedback',
      name: '站务反馈',
      description: '建议、BUG 反馈、投诉',
      icon: '📝',
      color: 'gray',
      allowsAnonymous: false,
      sortOrder: 80,
    },
  ];

  for (const board of boards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: board,
      create: board,
    });
  }

  console.log(`✅ ${boards.length} boards ready.`);

  // 敏感词最小集（仅占位，正式词库由运营导入）
  console.log('🌱 Seeding minimal sensitive word starter set…');
  const starter = [
    { word: '广告联系', category: SensitiveCategory.ad, action: SensitiveAction.review },
    { word: '微信号', category: SensitiveCategory.ad, action: SensitiveAction.mask },
  ];
  for (const sw of starter) {
    await prisma.sensitiveWord.upsert({
      where: { word: sw.word },
      update: sw,
      create: sw,
    });
  }
  console.log(`✅ ${starter.length} sensitive word entries.`);

  console.log('🌱 Seeding test users…');
  const { hash } = await import('argon2');
  const passwordHash = await hash('123qweasd!');

  const testUsers: Array<{ username: string; role: UserRole }> = [
    { username: 'hezhong233', role: UserRole.superadmin },
    { username: 'hezhong666', role: UserRole.admin },
  ];

  for (const testUser of testUsers) {
    const email = `${testUser.username}@pop.zjgsu.edu.cn`;
    await prisma.registrationRequest.upsert({
      where: { studentId: testUser.username },
      update: {
        email,
        passwordHash,
        username: testUser.username,
        status: 'approved',
        expiresAt: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000), // 10 years
      },
      create: {
        studentId: testUser.username,
        email,
        passwordHash,
        username: testUser.username,
        method: 'email',
        status: 'approved',
        expiresAt: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000), // 10 years
      },
    });

    await prisma.user.upsert({
      where: { username: testUser.username },
      update: {
        email,
        passwordHash,
        role: testUser.role,
        status: 'active',
        emailVerifiedAt: new Date(),
      },
      create: {
        username: testUser.username,
        email,
        passwordHash,
        role: testUser.role,
        status: 'active',
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    });
    console.log(`✅ User ${testUser.username} ready as ${testUser.role}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
