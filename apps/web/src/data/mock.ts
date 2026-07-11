import type {
  AnonymousPseudonym,
  Comment,
  Conversation,
  ConversationDetail,
  CurrentUser,
  DmPseudonym,
  Post,
  PostAuthor,
} from '@/types/api';

// ============================================================
// Boards — 全部允许匿名 (forum 已是全匿名)
// ============================================================

// ============================================================
// Helpers
// ============================================================

function anon(name: string, color: string, isOp = false): PostAuthor {
  const pseudonym: AnonymousPseudonym = { displayName: name, color, isOp };
  return { type: 'anonymous', pseudonym };
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60 * 1000).toISOString();
}

// ============================================================
// Posts — 全部匿名
// ============================================================

export const MOCK_POSTS: Post[] = [
  {
    id: '101',
    board: { slug: 'campus', name: '校园生活', icon: '📚', color: 'green' },
    author: anon('匿名 · 钱塘潮', 'oklch(0.7 0.15 60)'),
    title: '【公告】2026 春季运动会报名通道开启,本周日截止',
    contentExcerpt:
      '今年新增电竞、街舞、飞盘三个项目!报名链接 + 详细规则在评论区。各学院组队报名截止周日 23:59,过期不候。',
    upvotes: 412,
    downvotes: 8,
    score: 404,
    commentCount: 87,
    isLocked: false,
    isPinned: true,
    myVote: 1,
    createdAt: hoursAgo(4),
    hasImages: true,
    thumbnailUrl: '/浙工商校门.webp',
    imageUrls: ['/浙工商校门.webp'],
  },
  {
    id: '102',
    board: { slug: 'emotion', name: '情感天地', icon: '❤️', color: 'pink' },
    author: anon('匿名 · 晨曦', 'oklch(0.7 0.15 60)'),
    title: '今天在图书馆复习到凌晨,出门发现下雪了',
    contentExcerpt:
      '一个人走在回宿舍的路上,雪片落在睫毛上化成水。突然觉得读书也没那么苦了。分享给同样还在挣扎的你们。',
    upvotes: 2_341,
    downvotes: 12,
    score: 2_329,
    commentCount: 124,
    isLocked: false,
    isPinned: false,
    createdAt: hoursAgo(7),
  },
  {
    id: '103',
    board: { slug: 'course', name: '选课交流', icon: '💬', color: 'teal' },
    author: anon('匿名 · 数据派', 'oklch(0.62 0.18 240)'),
    title: '请问下学期《分布式系统》课报哪个老师好?评分对比表来了',
    contentExcerpt:
      '整理了过去三年三位老师的给分数据 + 作业量 + 期末难度。建议按你的兴趣和绩点目标选,文末附详细对比图。',
    upvotes: 562,
    downvotes: 14,
    score: 548,
    commentCount: 73,
    isLocked: false,
    isPinned: false,
    myVote: 1,
    createdAt: hoursAgo(11),
    hasImages: true,
    thumbnailUrl: '/logo.webp',
    imageUrls: ['/logo.webp'],
  },
  {
    id: '104',
    board: { slug: 'trade', name: '二手交易', icon: '🛒', color: 'amber' },
    author: anon('匿名 · 下沙夜话', 'oklch(0.68 0.16 130)'),
    title: '出 ThinkPad X1 Carbon 2024 款,9 成新,毕业急出',
    contentExcerpt:
      '配置:i7-1365U / 32GB / 1TB SSD,有发票保修到 2027 年。原价 12k,现价 6800。私信我看实物 + 谈细节。',
    upvotes: 89,
    downvotes: 3,
    score: 86,
    commentCount: 21,
    isLocked: false,
    isPinned: false,
    createdAt: hoursAgo(13),
    hasImages: true,
    thumbnailUrl: '/avatar.jpeg',
    imageUrls: ['/avatar.jpeg'],
  },
  {
    id: '105',
    board: { slug: 'emotion', name: '情感天地', icon: '❤️', color: 'pink' },
    author: anon('匿名 · 候鸟', 'oklch(0.65 0.18 200)'),
    title: '保研失败,绩点 3.78 还是不够,有同样情况的吗',
    contentExcerpt:
      '面了三所院校全部 waiting list,现在心态崩了。家里人催着我考公考研拿主意,我一个都不想。不知道有没有人和我一样。',
    upvotes: 1_087,
    downvotes: 4,
    score: 1_083,
    commentCount: 256,
    isLocked: false,
    isPinned: false,
    myVote: 1,
    createdAt: hoursAgo(16),
  },
  {
    id: '106',
    board: { slug: 'campus', name: '校园生活', icon: '📚', color: 'green' },
    author: anon('匿名 · 黄昏鸽', 'oklch(0.72 0.13 90)'),
    title: '本周食堂新菜测评:三楼新开的潮汕牛肉粿条 vs 西门凉皮',
    contentExcerpt:
      '认真吃了三天每家三次,给大家排个高低。结论先放上来:粿条胜在汤底,凉皮胜在性价比。详细评分表看图。',
    upvotes: 743,
    downvotes: 41,
    score: 702,
    commentCount: 198,
    isLocked: false,
    isPinned: false,
    createdAt: hoursAgo(19),
    hasImages: true,
    thumbnailUrl: '/浙工商校门.webp',
    imageUrls: ['/浙工商校门.webp', '/logo.webp'],
  },
  {
    id: '107',
    board: { slug: 'job', name: '实习就业', icon: '💼', color: 'purple' },
    author: anon('匿名 · 内推官', 'oklch(0.65 0.17 280)'),
    title: '某大厂杭州研发实习内推,前后端 / 算法 / 测试岗位均有',
    contentExcerpt:
      '简历投我私信(我开了私信),我走内部通道。要求大三大四 / 研一研二,每周到岗 ≥3 天,有项目经验加分。',
    upvotes: 234,
    downvotes: 6,
    score: 228,
    commentCount: 45,
    isLocked: false,
    isPinned: false,
    createdAt: hoursAgo(22),
  },
  {
    id: '108',
    board: { slug: 'emotion', name: '情感天地', icon: '❤️', color: 'pink' },
    author: anon('匿名 · 风信子', 'oklch(0.72 0.16 320)'),
    title: '给周二下午 3 点法语课坐我后排的女生',
    contentExcerpt:
      '我注意到你每次发音都很认真,今天你借了我一支笔。橙色封面、写着 LE BON USAGE。如果你看到,要不要一起吃个饭。',
    upvotes: 524,
    downvotes: 18,
    score: 506,
    commentCount: 67,
    isLocked: false,
    isPinned: false,
    createdAt: minutesAgo(95),
  },
  {
    id: '109',
    board: { slug: 'campus', name: '校园生活', icon: '📚', color: 'green' },
    author: anon('匿名 · 学生会', 'oklch(0.68 0.18 30)'),
    title: '5 月校园歌手大赛报名启动,海选 5/30 启动',
    contentExcerpt:
      '今年评委阵容公布:浙工商音乐学院两位老师 + 校外两位音乐人。冠军奖金 5000 + 录音棚使用权,具体规则戳官网。',
    upvotes: 167,
    downvotes: 5,
    score: 162,
    commentCount: 32,
    isLocked: false,
    isPinned: false,
    createdAt: hoursAgo(28),
  },
  {
    id: '110',
    board: { slug: 'zheng-neng-liang', name: '正能量', icon: '🏫', color: 'blue' },
    author: anon('匿名 · 拾荒猫', 'oklch(0.68 0.14 170)'),
    title: '在 2 号教学楼 304 教室捡到一个银色 AirPods Pro',
    contentExcerpt:
      '今天下午 3 点左右,在 304 后排座位下面捡到的,有划痕。失主私信我描述特征,核对后归还。',
    upvotes: 76,
    downvotes: 0,
    score: 76,
    commentCount: 14,
    isLocked: false,
    isPinned: false,
    createdAt: hoursAgo(31),
  },
];

// ============================================================
// Comments — 全部匿名
// ============================================================

export const MOCK_COMMENTS_FOR_POST_102: Comment[] = [
  {
    id: 'c1',
    postId: '102',
    author: anon('匿名 · 木棉', 'oklch(0.7 0.18 30)'),
    contentMd: '同感。今晚我也在自习室,看到楼下雪花一片片。',
    contentHtml: '<p>同感。今晚我也在自习室,看到楼下雪花一片片。</p>',
    upvotes: 124,
    downvotes: 1,
    score: 123,
    isDeleted: false,
    depth: 0,
    createdAt: hoursAgo(6),
    replies: [
      {
        id: 'c2',
        postId: '102',
        parentId: 'c1',
        author: anon('匿名 · 晨曦', 'oklch(0.7 0.15 60)', true),
        contentMd: '我们这种夜猫子互相点亮夜空。',
        contentHtml: '<p>我们这种夜猫子互相点亮夜空。</p>',
        upvotes: 89,
        downvotes: 0,
        score: 89,
        isDeleted: false,
        depth: 1,
        createdAt: hoursAgo(5),
        replies: [
          {
            id: 'c2a',
            postId: '102',
            parentId: 'c2',
            author: anon('匿名 · 木棉', 'oklch(0.7 0.18 30)'),
            contentMd: '哈哈这句话好暖,要不要存为我今晚的签名。',
            contentHtml: '<p>哈哈这句话好暖,要不要存为我今晚的签名。</p>',
            upvotes: 42,
            downvotes: 0,
            score: 42,
            isDeleted: false,
            depth: 2,
            createdAt: hoursAgo(4),
            replies: [
              {
                id: 'c2b',
                postId: '102',
                parentId: 'c2a',
                author: anon('匿名 · 晨曦', 'oklch(0.7 0.15 60)', true),
                contentMd: '随便用。明天就是新的一天。',
                contentHtml: '<p>随便用。明天就是新的一天。</p>',
                upvotes: 27,
                downvotes: 0,
                score: 27,
                isDeleted: false,
                depth: 3,
                createdAt: hoursAgo(3.5),
              },
            ],
          },
          {
            id: 'c2c',
            postId: '102',
            parentId: 'c2',
            author: anon('匿名 · 北纬 30', 'oklch(0.6 0.15 220)'),
            contentMd: '插一句,你们俩这段对话本身就是这个雪夜的剧本。',
            contentHtml: '<p>插一句,你们俩这段对话本身就是这个雪夜的剧本。</p>',
            upvotes: 53,
            downvotes: 1,
            score: 52,
            isDeleted: false,
            depth: 2,
            createdAt: hoursAgo(3),
          },
        ],
      },
      {
        id: 'c1b',
        postId: '102',
        parentId: 'c1',
        author: anon('匿名 · 砚台', 'oklch(0.6 0.12 290)'),
        contentMd: '我从图书馆走出来的时候差点滑倒,但抬头一看真的安静得好像世界停了。',
        contentHtml: '<p>我从图书馆走出来的时候差点滑倒,但抬头一看真的安静得好像世界停了。</p>',
        upvotes: 38,
        downvotes: 0,
        score: 38,
        isDeleted: false,
        depth: 1,
        createdAt: hoursAgo(2),
      },
    ],
  },
  {
    id: 'c3',
    postId: '102',
    author: anon('匿名 · 北纬 30', 'oklch(0.6 0.15 220)'),
    contentMd: '这种平静真的难得。要保持下去。',
    contentHtml: '<p>这种平静真的难得。要保持下去。</p>',
    upvotes: 56,
    downvotes: 0,
    score: 56,
    isDeleted: false,
    depth: 0,
    createdAt: hoursAgo(4),
    replies: [
      {
        id: 'c3a',
        postId: '102',
        parentId: 'c3',
        author: anon('匿名 · 晨曦', 'oklch(0.7 0.15 60)', true),
        contentMd: '试试看。谢谢你。',
        contentHtml: '<p>试试看。谢谢你。</p>',
        upvotes: 22,
        downvotes: 0,
        score: 22,
        isDeleted: false,
        depth: 1,
        createdAt: hoursAgo(3),
      },
    ],
  },
  {
    id: 'c4',
    postId: '102',
    author: anon('匿名 · 风灯', 'oklch(0.68 0.14 110)'),
    contentMd: '(这条已被作者删除)',
    contentHtml: '',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    isDeleted: true,
    depth: 0,
    createdAt: hoursAgo(1),
  },
];

// ============================================================
// Current user
// ============================================================

export const MOCK_CURRENT_USER: CurrentUser = {
  id: 'hezhong233',
  username: 'hezhong233',
  email: 'hezhong233@pop.zjgsu.edu.cn',
  emailVerified: true,
  avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=hezhong233',
  bio: '',
  role: 'user',
  unreadNotifications: 3,
  dmAllowed: true,
  unreadConversations: 2,
  createdAt: new Date(2024, 8, 1).toISOString(),
};

// ============================================================
// 私信 (DM) mock 数据
// ============================================================

function dmPseudonym(name: string, color: string): DmPseudonym {
  return { displayName: name, color };
}

export const MOCK_CONVERSATIONS: Conversation[] = [
  // 1) Active 会话 — 二手交易帖,我是买家发起,卖家已回
  {
    id: 'conv-1',
    partner: dmPseudonym('陌生人 · 槐序', 'oklch(0.7 0.16 80)'),
    iAmInitiator: true,
    status: 'active',
    origin: {
      kind: 'post',
      postId: '104',
      postTitle: '出 ThinkPad X1 Carbon 2024 款,9 成新,毕业急出',
    },
    lastMessagePreview: '可以的,明天下午下沙北门见?',
    lastMessageAt: minutesAgo(12),
    unreadCount: 1,
    createdAt: hoursAgo(6),
  },
  // 2) Pending — 别人对我发起,我还没回
  {
    id: 'conv-2',
    partner: dmPseudonym('陌生人 · 鸿渐', 'oklch(0.66 0.14 200)'),
    iAmInitiator: false,
    status: 'pending',
    origin: {
      kind: 'post',
      postId: '102',
      postTitle: '今天在图书馆复习到凌晨,出门发现下雪了',
    },
    lastMessagePreview: '看到你的帖子,我也是凌晨的图书馆人。如果想找人聊聊,可以回复我。',
    lastMessageAt: hoursAgo(2),
    unreadCount: 1,
    createdAt: hoursAgo(2),
  },
  // 3) Active 树洞 — 我发起,对方回了
  {
    id: 'conv-3',
    partner: dmPseudonym('陌生人 · 落山风', 'oklch(0.7 0.17 30)'),
    iAmInitiator: true,
    status: 'active',
    origin: {
      kind: 'post',
      postId: '105',
      postTitle: '保研失败,绩点 3.78 还是不够,有同样情况的吗',
    },
    lastMessagePreview: '谢谢你愿意听我说这些。其实我也不知道自己想要什么。',
    lastMessageAt: hoursAgo(8),
    unreadCount: 0,
    createdAt: daysAgo(1),
  },
  // 4) Pending — 我发起,对方还没回
  {
    id: 'conv-4',
    partner: dmPseudonym('陌生人 · 苇航', 'oklch(0.68 0.18 260)'),
    iAmInitiator: true,
    status: 'pending',
    origin: {
      kind: 'post',
      postId: '108',
      postTitle: '给周二下午 3 点法语课坐我后排的女生',
    },
    lastMessagePreview: '你说的是不是我?我借给了一个戴黑色眼镜的男生一支笔。',
    lastMessageAt: hoursAgo(20),
    unreadCount: 0,
    createdAt: hoursAgo(20),
  },
  // 5) Blocked 会话 — 历史记录
  {
    id: 'conv-5',
    partner: dmPseudonym('陌生人 · 已拉黑', 'oklch(0.5 0.05 0)'),
    iAmInitiator: false,
    status: 'blocked',
    origin: {
      kind: 'post',
      postId: '107',
      postTitle: '某大厂杭州研发实习内推',
    },
    lastMessagePreview: '(已拉黑该对话)',
    lastMessageAt: daysAgo(3),
    unreadCount: 0,
    createdAt: daysAgo(3),
  },
];

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86400 * 1000).toISOString();
}

// 详细消息 (仅几个常用会话有)
export const MOCK_CONVERSATION_DETAILS: Record<string, ConversationDetail> = {
  'conv-1': {
    conversation: MOCK_CONVERSATIONS[0],
    canSendMore: true,
    messages: [
      {
        id: 'm1-1',
        conversationId: 'conv-1',
        sender: 'me',
        contentMd: '你好,看到你发的电脑,我感兴趣。能再发几张照片吗?键盘磨损情况怎么样?',
        contentHtml: '<p>你好,看到你发的电脑,我感兴趣。能再发几张照片吗?键盘磨损情况怎么样?</p>',
        createdAt: hoursAgo(6),
        status: 'read',
      },
      {
        id: 'm1-2',
        conversationId: 'conv-1',
        sender: 'partner',
        contentMd: '你好!键盘基本没磨损,主力做项目用,但日常会戴键盘膜。我等下发几张细节图给你。',
        contentHtml:
          '<p>你好!键盘基本没磨损,主力做项目用,但日常会戴键盘膜。我等下发几张细节图给你。</p>',
        createdAt: hoursAgo(5.5),
      },
      {
        id: 'm1-3',
        conversationId: 'conv-1',
        sender: 'partner',
        contentMd: '价格 6800 可以小议吗?如果今天能确定,我可以送你一个备用电源 + 鼠标。',
        contentHtml: '<p>价格 6800 可以小议吗?如果今天能确定,我可以送你一个备用电源 + 鼠标。</p>',
        createdAt: hoursAgo(5),
      },
      {
        id: 'm1-4',
        conversationId: 'conv-1',
        sender: 'me',
        contentMd: '6500 怎么样?我今天能见面看实物。',
        contentHtml: '<p>6500 怎么样?我今天能见面看实物。</p>',
        createdAt: hoursAgo(2),
        status: 'read',
      },
      {
        id: 'm1-5',
        conversationId: 'conv-1',
        sender: 'partner',
        contentMd: '可以的,明天下午下沙北门见?',
        contentHtml: '<p>可以的,明天下午下沙北门见?</p>',
        createdAt: minutesAgo(12),
      },
    ],
  },
  'conv-2': {
    conversation: MOCK_CONVERSATIONS[1],
    canSendMore: false, // 我是接收方; 但接收方理论上可以发,这里 mock false 让对方发的是首条
    messages: [
      {
        id: 'm2-1',
        conversationId: 'conv-2',
        sender: 'partner',
        contentMd: '看到你的帖子,我也是凌晨的图书馆人。如果想找人聊聊,可以回复我。',
        contentHtml: '<p>看到你的帖子,我也是凌晨的图书馆人。如果想找人聊聊,可以回复我。</p>',
        createdAt: hoursAgo(2),
      },
    ],
  },
  'conv-3': {
    conversation: MOCK_CONVERSATIONS[2],
    canSendMore: true,
    messages: [
      {
        id: 'm3-1',
        conversationId: 'conv-3',
        sender: 'me',
        contentMd: '看到你的帖子。我去年也经历过。能聊聊吗?',
        contentHtml: '<p>看到你的帖子。我去年也经历过。能聊聊吗?</p>',
        createdAt: daysAgo(1),
        status: 'read',
      },
      {
        id: 'm3-2',
        conversationId: 'conv-3',
        sender: 'partner',
        contentMd: '可以的。其实只是想找个能理解的人。',
        contentHtml: '<p>可以的。其实只是想找个能理解的人。</p>',
        createdAt: hoursAgo(20),
      },
      {
        id: 'm3-3',
        conversationId: 'conv-3',
        sender: 'me',
        contentMd:
          '完全理解。我那时候也跟家里说不通,跟朋友又怕给他们添堵。后来发现就是要先承认自己暂时不知道下一步该怎么走,这件事就不那么难受了。',
        contentHtml:
          '<p>完全理解。我那时候也跟家里说不通,跟朋友又怕给他们添堵。后来发现就是要先承认自己暂时不知道下一步该怎么走,这件事就不那么难受了。</p>',
        createdAt: hoursAgo(12),
        status: 'read',
      },
      {
        id: 'm3-4',
        conversationId: 'conv-3',
        sender: 'partner',
        contentMd: '谢谢你愿意听我说这些。其实我也不知道自己想要什么。',
        contentHtml: '<p>谢谢你愿意听我说这些。其实我也不知道自己想要什么。</p>',
        createdAt: hoursAgo(8),
      },
    ],
  },
  'conv-4': {
    conversation: MOCK_CONVERSATIONS[3],
    canSendMore: false, // pending 状态 + 我是发起方 + 已经发过 1 条
    messages: [
      {
        id: 'm4-1',
        conversationId: 'conv-4',
        sender: 'me',
        contentMd: '你说的是不是我?我借给了一个戴黑色眼镜的男生一支笔。',
        contentHtml: '<p>你说的是不是我?我借给了一个戴黑色眼镜的男生一支笔。</p>',
        createdAt: hoursAgo(20),
        status: 'sent',
      },
    ],
  },
  'conv-5': {
    conversation: MOCK_CONVERSATIONS[4],
    canSendMore: false,
    blockedReason: 'blocked_by_me',
    messages: [
      {
        id: 'm5-1',
        conversationId: 'conv-5',
        sender: 'partner',
        contentMd: '(此处为反复骚扰内容,已拉黑)',
        contentHtml: '<p>(此处为反复骚扰内容,已拉黑)</p>',
        createdAt: daysAgo(3),
      },
    ],
  },
};
