import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_BOARDS = [
  {
    slug: 'campus',
    name: '校园生活',
    description: '校园日常、活动、趣事分享',
    icon: '📚',
    color: 'blue',
    allowsAnonymous: true,
    sortOrder: 1,
  },
  {
    slug: 'course',
    name: '选课交流',
    description: '选课推荐、课程评价、学习经验',
    icon: '💬',
    color: 'green',
    allowsAnonymous: true,
    sortOrder: 2,
  },
  {
    slug: 'trade',
    name: '二手交易',
    description: '闲置物品买卖、求购信息',
    icon: '🛒',
    color: 'orange',
    allowsAnonymous: false,
    sortOrder: 3,
  },
  {
    slug: 'lost-found',
    name: '失物招领',
    description: '丢失/拾获物品信息发布',
    icon: '📦',
    color: 'yellow',
    allowsAnonymous: false,
    sortOrder: 4,
  },
  {
    slug: 'job',
    name: '实习就业',
    description: '实习招聘、求职经验、内推信息',
    icon: '💼',
    color: 'purple',
    allowsAnonymous: false,
    sortOrder: 5,
  },
  {
    slug: 'emotion',
    name: '情感天地',
    description: '倾诉、树洞、情感话题',
    icon: '❤️',
    color: 'red',
    allowsAnonymous: true,
    sortOrder: 6,
  },
  {
    slug: 'exam',
    name: '考研考公',
    description: '考研/考公/考证经验交流',
    icon: '📖',
    color: 'indigo',
    allowsAnonymous: true,
    sortOrder: 7,
  },
  {
    slug: 'feedback',
    name: '站务反馈',
    description: '建议、BUG 反馈、投诉',
    icon: '📝',
    color: 'gray',
    allowsAnonymous: false,
    sortOrder: 8,
  },
];

async function main() {
  console.log('开始初始化板块数据...');

  for (const board of DEFAULT_BOARDS) {
    const existing = await prisma.board.findUnique({
      where: { slug: board.slug },
    });

    if (existing) {
      console.log(`板块 "${board.name}" (${board.slug}) 已存在，跳过`);
      continue;
    }

    await prisma.board.create({
      data: {
        ...board,
        status: 'active',
      },
    });
    console.log(`✓ 创建板块: ${board.name} (${board.slug})`);
  }

  console.log('\n板块初始化完成！');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
