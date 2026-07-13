/**
 * 将 seed_posts.json 导入浙工商树洞数据库
 * 使用: npx tsx import_to_treehole.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface SeedPost {
  id: number;
  title: string;
  content: string;
  author: string;
  likes: number;
  images: number;
  tag: string;
  createdAt: string;
}

async function main() {
  const raw = fs.readFileSync('./seed_posts.json', 'utf-8');
  const posts: SeedPost[] = JSON.parse(raw);

  // 1. 查找或创建虚拟用户 (作为这批帖子的作者)
  const systemEmail = 'seed@unidating.top';
  let user = await prisma.user.findUnique({ where: { email: systemEmail } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: systemEmail,
        username: 'xhs_seeder',
        passwordHash: '$2b$10$seed_not_login', // 不能登录的占位密码
        termsAcceptedAt: new Date(),
        bio: '小红书种子内容运营账号',
        role: 'user',
        status: 'active',
      },
    });
    console.log('创建种子用户:', user.id);
  } else {
    console.log('使用已有种子用户:', user.id);
  }

  // 2. 查找或创建默认板块
  const boardSlug = 'zheng-neng-liang';
  let board = await prisma.board.findUnique({ where: { slug: boardSlug } });

  if (!board) {
    board = await prisma.board.create({
      data: {
        slug: boardSlug,
        name: '正能量',
        description: '浙江工商大学有趣、温暖、正能量的校园生活分享',
        allowsAnonymous: true,
        sortOrder: 1,
      },
    });
    console.log('创建板块:', board.id);
  } else {
    console.log('使用已有板块:', board.id);
  }

  // 3. 将内容中的 \n 转为 Markdown 换行，并生成简单 HTML
  const nl2br = (str: string) => str.replace(/\n/g, '<br/>');

  // 4. 批量插入帖子
  let inserted = 0;
  for (const p of posts) {
    const contentMd = p.content;
    const contentHtml = nl2br(contentMd).replace(
      /#(浙工商|浙江工商大学|[\u4e00-\u9fa5]+)/g,
      '<a href="/tag/$1" class="tag">#$1</a>',
    );

    await prisma.post.create({
      data: {
        boardId: board.id,
        authorId: user.id,
        title: p.title,
        contentMd,
        contentHtml,
        isAnonymous: true,
        status: 'published',
        upvotes: p.likes,
        downvotes: 0,
        score: p.likes,
        commentCount: 0,
        hotScore: computeHotScore(p.likes, 0, new Date(p.createdAt)),
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.createdAt),
      },
    });
    inserted++;
  }

  // 5. 更新板块帖子计数
  const postCount = await prisma.post.count({ where: { boardId: board.id } });
  await prisma.board.update({
    where: { id: board.id },
    data: { postCount },
  });

  console.log(`\n导入完成！共插入 ${inserted} 条帖子到板块 "${board.name}"`);
  console.log('板块当前帖子总数:', postCount);
}

// 简化版 Reddit hot score
function computeHotScore(upvotes: number, comments: number, createdAt: Date): number {
  const score = upvotes + comments * 2;
  const order = Math.log10(Math.max(score, 1));
  const seconds = createdAt.getTime() / 1000 - 1735689600; // 2025-01-01 epoch
  return +(order + seconds / 45000).toFixed(7);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
