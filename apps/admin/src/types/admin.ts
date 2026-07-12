/**
 * Admin API 类型 — 与后端 `plan §2.9 /admin/*` 接口契约保持一致
 */

export type UserRole = 'user' | 'moderator' | 'admin' | 'superadmin';
export type UserStatus = 'active' | 'suspended' | 'banned';
export type ContentStatus = 'published' | 'pending_review' | 'hidden' | 'deleted';
export type ReportCategory = 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
export type ReportStatus = 'open' | 'resolved' | 'rejected';
export type ReportTargetType =
  | 'post'
  | 'comment'
  | 'user'
  | 'conversation'
  | 'direct_message'
  | 'chatroom_message';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: string | null;
  suspendedUntil: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  postCount: number;
  commentCount: number;
  reportCount: number;
  createdAt: string;
}

export interface AdminReportTargetSnapshot {
  type: ReportTargetType;
  title?: string;
  preview: string;
  authorUsername?: string;
  /** 是否匿名发布；真实身份仅超级管理员可调阅，且每次读取自动审计 */
  isAnonymous?: boolean;
  boardSlug?: string;
  createdAt?: string;
  /** 举报发生时已经固化证据，后续删除原内容不会影响调查 */
  evidencePreserved?: boolean;
  messageCount?: number;
}

export interface AdminReport {
  id: string;
  reporter: { id: string; username: string };
  targetType: ReportTargetType;
  targetId: string;
  targetSnapshot: AdminReportTargetSnapshot;
  category: ReportCategory;
  reason?: string;
  status: ReportStatus;
  priority?: number;
  version?: number;
  handledBy?: { id: string; username: string } | null;
  handledAt?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
}

export interface AdminPost {
  id: string;
  boardSlug: string;
  boardName: string;
  title: string;
  excerpt: string;
  authorUsername: string;
  /** 匿名内容的列表接口不会返回作者 ID */
  authorId?: string;
  isAnonymous: boolean;
  status: ContentStatus;
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  reportCount: number;
  isPinned: boolean;
  isLocked: boolean;
  moderationLabels?: unknown;
  createdAt: string;
}

export interface AdminComment {
  id: string;
  postId: string;
  postTitle: string;
  boardSlug: string;
  excerpt: string;
  authorUsername: string;
  /** 匿名内容的列表接口不会返回作者 ID */
  authorId?: string;
  isAnonymous: boolean;
  status: ContentStatus;
  score: number;
  reportCount: number;
  moderationLabels?: unknown;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  actor: { id: string; username: string; role: UserRole };
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface AdminAuditActor {
  id: string;
  username: string;
  role: UserRole;
}

export interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  totalComments: number;
  openReports: number;
  pendingRegistrations: number;
  newUsersToday: number;
  newPostsToday: number;
  newCommentsToday: number;
  newReportsToday: number;
  /** 各内容表中处于 pending_review 的总数 */
  pendingReview: number;
  pendingUploads: number;
  pendingCases: number;
  pendingAppeals: number;
  /** 30 天趋势 */
  trend: Array<{
    date: string;
    users: number;
    posts: number;
    comments: number;
    reports: number;
  }>;
}

// ============================================================
// Unified moderation queue / image review
// ============================================================

export type ModerationSurface =
  | 'post'
  | 'comment'
  | 'direct_message'
  | 'chatroom_message'
  | 'upload';
export type ModerationCaseStatus = 'pending' | 'in_review' | 'resolved' | 'dismissed';
export type ModerationDecision = 'allow' | 'warn' | 'hide' | 'delete' | 'suspend' | 'ban';

export interface AdminModerationCase {
  id: string;
  surface: ModerationSurface;
  targetId: string | null;
  status: ModerationCaseStatus;
  riskLevel: number;
  reasonCodes: unknown;
  matchedRules: unknown;
  contentExcerpt: string | null;
  canRevealIdentity: boolean;
  assignedTo: { id: string; username: string } | null;
  version: number;
  legalHold: boolean;
  createdAt: string;
}

// ============================================================
// Superadmin direct-message trace
// ============================================================

export interface AdminTraceIdentity {
  /** 站内用户唯一 ID；不是匿名昵称或会话内临时标识。 */
  uid: string;
  username: string;
  email: string;
  /** 通过注册申请邮箱关联；历史或种子账号可能没有学号。 */
  studentId: string | null;
}

export type ConversationStatus = 'pending' | 'active' | 'blocked';

export interface AdminDirectMessageTrace {
  id: string;
  contentMd: string;
  contentHtml: string;
  status: ContentStatus;
  moderationLabels: unknown;
  senderIp: string | null;
  senderUserAgent: string | null;
  legalHold: boolean;
  readAt: string | null;
  createdAt: string;
  sender: AdminTraceIdentity;
  recipient: AdminTraceIdentity;
  conversation: {
    id: string;
    originPostId: string | null;
    status: ConversationStatus;
    blockedByUserId: string | null;
    initiator: AdminTraceIdentity;
    recipient: AdminTraceIdentity;
    lastMessageAt: string;
    createdAt: string;
    updatedAt: string;
  };
}

export type UploadModerationStatus = 'pending' | 'flagged';

export interface AdminPendingUpload {
  id: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  moderationStatus: UploadModerationStatus;
  moderationLabels: unknown;
  attachedToType: string | null;
  attachedToId: string | null;
  createdAt: string;
  previewUrl: string;
}

export type AdminAppealStatus = 'pending' | 'approved' | 'rejected';

export interface AdminAppeal {
  id: string;
  reason: string;
  status: AdminAppealStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    status: UserStatus;
  };
  reviewer: { id: string; username: string } | null;
  sanction: {
    id: string;
    caseId: string | null;
    type: 'warning' | 'mute' | 'suspension' | 'ban';
    status: 'active' | 'expired' | 'revoked';
    scope: string;
    policyRule: string | null;
    reason: string;
    startsAt: string;
    endsAt: string | null;
    imposedBy: { id: string; username: string } | null;
  };
}

// ============================================================
// Registration (注册审批)
// ============================================================

export type RegistrationStatus = 'not_registered' | 'pending' | 'approved' | 'rejected' | 'expired';
export type RegistrationMethod = 'email' | 'screenshot';

export interface AdminRegistrationRequest {
  id: string;
  studentId: string;
  email: string;
  username: string;
  realName?: string;
  screenshotUrl?: string;
  method: RegistrationMethod;
  status: RegistrationStatus;
  reviewNote?: string;
  reviewedBy?: { id: string; username: string } | null;
  reviewedAt?: string | null;
  createdAt: string;
  expiresAt: string;
  remainingHours?: number;
}

export interface AdminCurrentUser {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  role: 'moderator' | 'admin' | 'superadmin';
}

export interface SystemAnnouncement {
  id: string;
  title: string;
  body: string;
  linkUrl?: string;
  audience: string;
  recipientCount: number;
  publishedBy: string;
  createdAt: string;
}

// ============================================================
// Sensitive words (敏感词)
// ============================================================

export type SensitiveWordCategory = 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
/** block=直接拒发, review=进人工审核队列, mask=以 * 替换后正常发布 */
export type SensitiveWordAction = 'block' | 'review' | 'mask';

export interface SensitiveWord {
  id: string;
  /** 词本身,大小写不敏感存储为小写 */
  word: string;
  category: SensitiveWordCategory;
  action: SensitiveWordAction;
  /** 命中此词的内容数(按月统计) */
  hitCount: number;
  enabled: boolean;
  /** 添加人 */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** 备注/上下文示例 */
  note?: string;
}

// ============================================================
// Pagination (分页)
// ============================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ============================================================
// Board Applications (板块申请)
// ============================================================

export interface BoardApplication {
  id: string;
  name: string;
  description: string;
  applyReason: string;
  applicant: {
    id: string;
    username: string;
  } | null;
  appliedAt: string | null;
}
