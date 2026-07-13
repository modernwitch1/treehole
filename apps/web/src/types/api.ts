/**
 * API DTO 类型 — 与后端 `plan §2` 的接口契约保持一致
 * 此文件唯一可信源在前端;后端 Slice 2+ 实现时如有偏差以后端为准并回写这里
 */

export type UserRole = 'user' | 'moderator' | 'admin' | 'superadmin';
export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  role: UserRole;
  createdAt: string;
}

/** 公开匿名身份；所有用户统一显示为“浙小商”，真实 UID 仅后台可见。 */
export interface AnonymousPseudonym {
  /** 公开渲染昵称，固定为“浙小商”。 */
  displayName: string;
  /** 头像气泡色 (HSL/HEX/oklch) */
  color: string;
  /** 是否是楼主 */
  isOp: boolean;
}

export type PostAuthor =
  | { type: 'user'; user: Pick<User, 'id' | 'username' | 'avatarUrl'> }
  | { type: 'anonymous'; pseudonym: AnonymousPseudonym };

export interface BoardInfo {
  slug: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

export interface Board extends BoardInfo {
  id: string;
  description?: string | null;
  rules?: string | null;
  allowsAnonymous: boolean;
  postCount: number;
  subscriberCount: number;
}

export interface Post {
  id: string;
  board: BoardInfo;
  author: PostAuthor;
  title: string;
  /** 列表页只需 contentExcerpt; 详情页才需要完整 html */
  contentExcerpt?: string;
  contentMd?: string;
  contentHtml?: string;
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  isLocked: boolean;
  isPinned: boolean;
  status?: 'published' | 'pending_review' | 'hidden' | 'deleted';
  /** 当前用户的投票状态: 1=赞, -1=踩, 0=未投/已撤销 */
  myVote?: 1 | -1 | 0;
  createdAt: string;
  /** 首图 URL, 列表卡片缩略图用 */
  thumbnailUrl?: string;
  /** 帖子图片 URL 列表 */
  imageUrls?: string[];
  /** 帖子是否含图 (用于列表 chip) */
  hasImages?: boolean;
  quotedPost?: {
    id: string;
    title: string;
    contentExcerpt: string;
    board: Pick<BoardInfo, 'slug' | 'name'>;
  };
}

export interface Comment {
  id: string;
  postId: string;
  parentId?: string;
  author: PostAuthor;
  contentMd: string;
  contentHtml: string;
  upvotes: number;
  downvotes: number;
  score: number;
  myVote?: 1 | -1 | 0;
  isDeleted: boolean;
  status?: 'published' | 'pending_review' | 'hidden' | 'deleted';
  /** 0-3 */
  depth: number;
  createdAt: string;
  replies?: Comment[];
}

export type SortType = 'hot' | 'new' | 'top';
export type TopPeriod = 'day' | 'week' | 'month' | 'all';

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

// ============================================================
// Registration (审批注册)
// ============================================================

export type RegistrationStatus =
  | 'not_registered'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'banned';
export type RegistrationMethod = 'email' | 'screenshot';

export interface RegistrationRequest {
  id: string;
  studentId: string;
  email: string;
  username: string;
  realName?: string;
  screenshotUrl?: string;
  method: RegistrationMethod;
  status: RegistrationStatus;
  reviewNote?: string;
  createdAt: string;
  expiresAt: string;
}

export interface RegistrationResult {
  registered: boolean;
  request?: RegistrationRequest;
  message?: string;
}

export interface CurrentUser extends User {
  email: string;
  emailVerified: boolean;
  unreadNotifications: number;
  /** 是否允许陌生人私信 */
  dmAllowed: boolean;
  unreadConversations: number;
  accountStatus: 'active' | 'suspended';
  communitySafety: {
    policyVersion: string;
    accountAgeDays: number;
    isNewUser: boolean;
    acknowledgedToday: boolean;
    shouldPrompt: boolean;
    rulesUrl: string;
  };
}

// ============================================================
// 美食模块
// ============================================================

export interface FoodCanteen {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  windows: FoodWindow[];
}

export interface FoodMerchant {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  contactDisplay?: string | null;
  status?: 'pending' | 'active' | 'suspended' | 'closed';
  windows: FoodWindow[];
}

export interface FoodWindow {
  id: string;
  floor: number;
  name: string;
  windowNumber?: string | null;
  locationDescription?: string | null;
  canteen: { id: string; slug: string; name: string };
  merchant?: { id: string; slug: string; name: string; logoUrl?: string | null };
  products?: FoodProduct[];
}

export interface FoodProduct {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  priceCents?: number | null;
  imageUrl?: string | null;
  status?: 'draft' | 'pending_review' | 'published' | 'hidden' | 'deleted';
  isAvailable?: boolean;
  sortOrder?: number;
}

export type FoodPostType = 'new_product' | 'promotion' | 'advertisement' | 'notice';
export type FoodContentStatus = 'published' | 'pending_review' | 'hidden' | 'deleted';

export interface FoodPost {
  id: string;
  type: FoodPostType;
  title: string;
  contentMd: string;
  contentHtml: string;
  status?: FoodContentStatus;
  coverUrl?: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  merchant: { id: string; slug: string; name: string; logoUrl?: string | null };
  window: FoodWindow | null;
}

export interface FoodReviewReply {
  id: string;
  contentMd: string;
  contentHtml: string;
  status: FoodContentStatus;
  isOfficial: boolean;
  merchant: { id: string; slug: string; name: string; logoUrl?: string | null };
  createdAt: string;
}

export interface FoodReview {
  id: string;
  type: 'taste_review' | 'suggestion';
  tasteScore: number | null;
  contentMd: string;
  contentHtml: string;
  status?: FoodContentStatus;
  isAnonymous: boolean;
  author:
    | { type: 'anonymous'; displayName: string }
    | { type: 'user'; username: string; avatarUrl?: string | null };
  replies: FoodReviewReply[];
  window: {
    id: string;
    name: string;
    floor: number;
    canteen: { id: string; slug: string; name: string };
    merchant: { id: string; slug: string; name: string; logoUrl?: string | null };
  };
  createdAt: string;
}

export interface FoodReviewsPage {
  averageTasteScore: number | null;
  reviewCount: number;
  items: FoodReview[];
  nextCursor?: string;
}

export type SanctionType = 'warning' | 'mute' | 'suspension' | 'ban';
export type SanctionStatus = 'active' | 'expired' | 'revoked';
export type AppealStatus = 'pending' | 'approved' | 'rejected';

export interface MySanction {
  id: string;
  caseId: string | null;
  type: SanctionType;
  status: SanctionStatus;
  scope: string;
  policyRule: string | null;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
  revokeNote: string | null;
  createdAt: string;
  appeal: {
    id: string;
    reason: string;
    status: AppealStatus;
    reviewNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
  } | null;
}

export interface NotificationItem {
  id: string;
  type: 'reply_post' | 'reply_comment' | 'mention' | 'vote_milestone' | 'system';
  title: string;
  body: string;
  linkUrl?: string;
  announcementId?: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  items: NotificationItem[];
  unreadCount: number;
}

// ============================================================
// 私信 (DM)
// ============================================================

/**
 * 会话状态机:
 *   pending  — 发起方已发,接收方未回。发起方仅能发 1 条 message
 *   active   — 接收方至少回过 1 条,双方可自由对话
 *   blocked  — 任一方拉黑后封闭,双方不可再发
 */
export type ConversationStatus = 'pending' | 'active' | 'blocked';

/**
 * 私信中的会话标识，只用于区分不同会话，不代表全局用户身份。
 */
export interface DmPseudonym {
  displayName: string;
  color: string;
  conversationCode: string;
}

/** 会话来源上下文,只让接收方知道是从哪个帖子触发的 */
export interface ConversationOrigin {
  kind: 'post' | 'comment';
  postId: string;
  postTitle: string;
  tag?: string;
}

export interface Conversation {
  id: string;
  /** 对方在本会话中的昵称 */
  partner: DmPseudonym;
  /** 是否我是发起方 */
  iAmInitiator: boolean;
  status: ConversationStatus;
  origin?: ConversationOrigin;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  /** sender = me 表示我发的 */
  sender: 'me' | 'partner';
  contentMd: string;
  contentHtml: string;
  createdAt: string;
  /** 仅 sender=me 时有意义 */
  status?: 'sending' | 'sent' | 'read' | 'pending_review' | 'not_delivered';
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  /** 当 status=pending 且 iAmInitiator=true 时, 你只能再发 (1 - messagesSent) 条 */
  canSendMore: boolean;
  /** 阻止状态原因 */
  blockedReason?: 'partner_dm_disabled' | 'blocked_by_partner' | 'blocked_by_me';
}

// ============================================================
// 选课指南针 (Course Reviews)
// ============================================================

export interface Course {
  id: string;
  courseCode?: string | null;
  name: string;
  teacher: string;
  credits?: string | null;
  department: string;
  category: string;
  courseModule?: string | null;
  reviewCount: number;
  topTags: string[];
}

export interface CourseReview {
  id: string;
  courseId: string;
  tags: string[];
  content: string;
  semester: string;
  author: { type: 'anonymous'; pseudonym: AnonymousPseudonym } | { type: 'user'; username: string };
  helpful: number;
  createdAt: string;
}

// ============================================================
// Chatrooms (在线聊天房)
// ============================================================

export interface ChatroomDetail {
  id: string;
  uid: string;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  creatorId: string;
  creatorUsername: string;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  isActive: boolean;
  participantCount: number;
}

export interface ChatroomMessageDto {
  id: string;
  chatroomUid: string;
  content: string;
  createdAt: string;
  isFlagged: boolean;
  moderationStatus: 'published' | 'pending_review' | 'hidden' | 'deleted';
  isMine?: boolean;
  senderNickname: string;
  senderAvatar: string;
}
