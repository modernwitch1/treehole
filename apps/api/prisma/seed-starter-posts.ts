import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import MarkdownIt from 'markdown-it';

const prisma = new PrismaClient();
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });

type StarterPost = { board: string; title: string; content: string };
const topics: Record<string, string[]> = {
  campus: [
    '新生报到前，最值得提前准备的三样东西是什么？', '宿舍收纳有哪些真正好用、不占地方的方案？',
    '从寝室到教学楼，你最常走哪条路线？', '下沙周末半日游，有哪些学生党路线？',
    '杭州梅雨季和台风天，住校要注意什么？', '校园里适合安静坐一会儿的地方有哪些？',
  ],
  course: [
    '第一次选课，怎样安排课表不容易后悔？', '通识课怎么选：兴趣优先还是时间优先？',
    '小组作业怎样分工，才能少一点临时抱佛脚？', '做课堂展示时，怎样克服紧张和超时？',
    '期末复习从哪一周开始最合适？',
  ],
  'zheng-neng-liang': [
    '最近在校园里遇到的一件小温暖', '失物招领信息怎样写，找回概率更高？',
    '你最想安利的校园活动是什么？', '给下一届新生留一句真正有用的话',
  ],
  job: [
    '第一份实习从哪里开始找比较靠谱？', '没有实习经历，简历第一版可以写什么？',
    '商科同学可以提前练哪些通用技能？', '面试结束后，你会怎样复盘？',
  ],
  exam: [
    '考研择校时，你最看重哪些信息？', '考公、考编信息差主要怎么补？',
    '备考期间如何保持稳定作息？', '四六级备考，最值得长期坚持的习惯是什么？',
  ],
  trade: ['毕业季闲置物品怎么定价更容易成交？', '求购教材前，先确认哪些信息？', '校园二手交易防骗清单'],
  emotion: [
    '刚开学有点不适应，可以从哪些小事开始？', '和室友生活习惯不同，怎么开口沟通？',
    '大学里如何建立边界感？', '最近压力大时，你会怎样让自己缓下来？',
  ],
};

const guidance: Record<string, string> = {
  campus: '欢迎分享亲身经验，并注明适用的校区、宿舍区或时间段。涉及尺寸、开放时间和校务安排时，请以现场情况及学校最新通知为准。',
  course: '欢迎从时间安排、学习收获、作业形式和个人基础等角度交流。请描述具体体验，避免人身评价；课程规则以教务系统和学院通知为准。',
  'zheng-neng-liang': '欢迎记录具体、普通的校园善意。请保护当事人隐私，不公开姓名、证件、联系方式等可识别信息。',
  job: '欢迎分享正规信息渠道和可复用的方法。请勿发布收费内推、押金培训或引流联系方式，也不要编造经历和数据。',
  exam: '经验帖只能作为参考，政策、招录、考试时间和报考要求请以当年官方文件为准。请勿分享盗版资料或“包过”信息。',
  trade: '请写清物品版本、成色、瑕疵、价格和交付方式。贵重物品尽量当面验货，不点击陌生付款链接，不提供验证码。',
  emotion: '欢迎分享尊重自己和他人的沟通方法，不曝光具体同学。如情绪持续影响生活或存在安全风险，请优先联系可信任的人及学校专业支持渠道。',
};

const starterPosts: StarterPost[] = Object.entries(topics).flatMap(([board, titles]) =>
  titles.map((title) => ({ board, title: `【站务话题】${title}`, content: guidance[board] })),
);
starterPosts.push(
  {
    board: 'feedback',
    title: '【站务说明】这些冷启动帖子是什么？',
    content: '为了避免新站首页空白，站务参考公开平台上反复出现的校园话题，重新整理了这批讨论引导帖。它们不冒充真实同学经历，不代表学校官方立场，也没有伪造点赞或评论。欢迎大家发布真实问题和经验。',
  },
  {
    board: 'feedback',
    title: '【站务征集】你希望论坛新增哪些板块？',
    content: '目前板块覆盖校园生活、选课、交易、就业、情感和备考。如果你希望增加学院交流、运动搭子、竞赛组队或其他主题，请说明使用场景和基本版规建议。',
  },
);

async function main() {
  const author = await prisma.user.upsert({
    where: { email: 'starter-posts@pop.zjgsu.edu.cn' },
    update: { username: '站务话题助手', bio: '发布站务整理的冷启动话题，不代表学校官方。', role: 'user', status: 'active', dmAllowed: false },
    create: {
      email: 'starter-posts@pop.zjgsu.edu.cn', emailVerifiedAt: new Date(), username: '站务话题助手',
      passwordHash: await hash(`starter-${Date.now()}-${Math.random()}`), bio: '发布站务整理的冷启动话题，不代表学校官方。',
      role: 'user', status: 'active', termsAcceptedAt: new Date(), dmAllowed: false,
    },
  });
  const slugs = [...new Set(starterPosts.map(({ board }) => board))];
  const boards = await prisma.board.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const boardIds = new Map(boards.map((board) => [board.slug, board.id]));
  const missing = slugs.filter((slug) => !boardIds.has(slug));
  if (missing.length) throw new Error(`Missing boards: ${missing.join(', ')}. Run pnpm db:seed first.`);

  let created = 0;
  for (const [index, post] of starterPosts.entries()) {
    if (await prisma.post.findFirst({ where: { authorId: author.id, title: post.title }, select: { id: true } })) continue;
    const createdAt = new Date(Date.now() - (starterPosts.length - index) * 18 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.post.create({ data: {
        boardId: boardIds.get(post.board)!, authorId: author.id, title: post.title,
        contentMd: post.content, contentHtml: markdown.render(post.content), createdAt, updatedAt: createdAt,
      } }),
      prisma.board.update({ where: { id: boardIds.get(post.board)! }, data: { postCount: { increment: 1 } } }),
    ]);
    created += 1;
  }
  console.log(`Starter posts ready: ${created} created, ${starterPosts.length - created} already existed.`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => prisma.$disconnect());
