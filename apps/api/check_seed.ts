import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const board = await prisma.board.findFirst({ where: { slug: 'zheng-neng-liang' } });
  if (!board) {
    console.log('板块不存在');
    return;
  }
  const posts = await prisma.post.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { title: true, upvotes: true, commentCount: true, createdAt: true },
  });
  console.log('=== 最新 5 条帖子 ===');
  posts.forEach((p, i) => console.log(`${i + 1}. [${p.upvotes}赞] ${p.title}`));
  const total = await prisma.post.count({ where: { boardId: board.id } });
  const totalUpvotes = await prisma.post.aggregate({
    where: { boardId: board.id },
    _sum: { upvotes: true },
  });
  console.log(`\n总计: ${total} 条帖子, 点赞总数: ${totalUpvotes._sum.upvotes || 0}`);
}

main().finally(() => prisma.$disconnect());
