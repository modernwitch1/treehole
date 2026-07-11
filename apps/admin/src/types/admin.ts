/**
 * Admin API 类型 — 与后端 `plan §2.9 /admin/*` 接口契约保持一致
 */

export type UserRole = 'user' | 'moderator' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';
export type ContentStatus = 'published' | 'pending_review' | 'hidden' | 'deleted';
export type ReportCategory = 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
export type ReportStatus = 'open' | 'resolved' | 'rejected';
export type ReportTargetType = 'post' | 'comment' | 'user';

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
  /** 是否匿名发布；真实身份只能通过审计接口按需查看 */
  isAnonymous?: boolean;
  realAuthorId?: string;
  realAuthorUsername?: string;
  boardSlug?: string;
  createdAt?: string;
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
  authorId: string;
  isAnonymous: boolean;
  status: ContentStatus;
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  reportCount: number;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: string;
}

export interface AdminComment {
  id: string;
  postId: string;
  postTitle: string;
  boardSlug: string;
  excerpt: string;
  authorUsername: string;
  authorId: string;
  isAnonymous: boolean;
  status: ContentStatus;
  score: number;
  reportCount: number;
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
  role: 'moderator' | 'admin';
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
