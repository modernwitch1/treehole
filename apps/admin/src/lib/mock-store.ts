/**
 * Mock 数据持久化层 — 仅 mock 模式使用。
 *
 * 设计目标:
 * - mock 模式下,admin 在 UI 上做的增删改(封禁用户/审批注册/隐藏帖子等)能跨页面/刷新保留。
 * - 后端 Slice 10 实装后,api.ts 切真接口即可,本文件不会被引用。
 *
 * 实现:
 * - 把 data/mock.ts 里几个数组的"当前快照"存进 localStorage。
 * - 首次读取时把内置 mock 当默认值写回。
 * - 同时同步到一个 cookie,让 web app(不同端口同域)也能看到关键状态(封禁列表)。
 */

import {
  MOCK_ADMIN_USERS,
  MOCK_ADMIN_POSTS,
  MOCK_ADMIN_COMMENTS,
  MOCK_ADMIN_REPORTS,
  MOCK_AUDIT_LOGS,
  MOCK_REGISTRATIONS,
  MOCK_SENSITIVE_WORDS,
} from '@/data/mock';
import type {
  AdminAuditLog,
  AdminComment,
  AdminPost,
  AdminRegistrationRequest,
  AdminReport,
  AdminUser,
  SensitiveWord,
} from '@/types/admin';

const KEYS = {
  users: 'admin-mock-users',
  posts: 'admin-mock-posts',
  comments: 'admin-mock-comments',
  reports: 'admin-mock-reports',
  audit: 'admin-mock-audit-logs',
  registrations: 'admin-mock-registrations',
  sensitiveWords: 'admin-mock-sensitive-words',
} as const;

/** Mock 数据结构变更时 bump,使旧 localStorage 失效 */
const STORE_VERSION = '4';
const VERSION_KEY = 'admin-mock-store-version';

const BAN_COOKIE = 'forum_banned_user_ids';
const SUSPEND_COOKIE = 'forum_suspended_user_ids';
const POST_STATE_COOKIE = 'forum_mock_post_states';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function ensureVersion(): void {
  if (!isBrowser()) return;
  try {
    const v = localStorage.getItem(VERSION_KEY);
    if (v !== STORE_VERSION) {
      // mock 结构变了 — 清掉所有旧数据
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(VERSION_KEY, STORE_VERSION);
    }
  } catch {
    /* ignore */
  }
}

function loadOrInit<T>(key: string, fallback: T[]): T[] {
  if (!isBrowser()) return fallback;
  ensureVersion();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    /* ignore */
  }
  // 首次访问 - 写入默认
  try {
    localStorage.setItem(key, JSON.stringify(fallback));
  } catch {
    /* ignore */
  }
  return fallback;
}

function save<T>(key: string, data: T[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

// ============================================================
// Cookie helpers — 用于跨 app(admin / web) 同步封禁状态
// ============================================================

function setCookie(name: string, value: string): void {
  if (!isBrowser()) return;
  // 不带 port: cookie 在同 hostname 下跨端口共享
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=86400; SameSite=Lax`;
}

function getCookie(name: string): string {
  if (!isBrowser()) return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function refreshBanCookies(users: AdminUser[]): void {
  const banned = users.filter((u) => u.status === 'banned').map((u) => u.id);
  const suspended = users.filter((u) => u.status === 'suspended').map((u) => u.id);
  // username 也写进去,web 端不知道 id 时按 username 匹配
  const bannedNames = users.filter((u) => u.status === 'banned').map((u) => u.username);
  const suspendedNames = users.filter((u) => u.status === 'suspended').map((u) => u.username);
  setCookie(BAN_COOKIE, [...banned, ...bannedNames].join(','));
  setCookie(SUSPEND_COOKIE, [...suspended, ...suspendedNames].join(','));
}

function refreshPostStateCookie(posts: AdminPost[]): void {
  const states = posts
    .filter((p) => p.status !== 'published' || p.isPinned || p.isLocked)
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      isPinned: p.isPinned,
      isLocked: p.isLocked,
    }));
  setCookie(POST_STATE_COOKIE, JSON.stringify(states));
}

// ============================================================
// 公开 API
// ============================================================

export function loadUsers(): AdminUser[] {
  return loadOrInit<AdminUser>(KEYS.users, MOCK_ADMIN_USERS);
}
export function saveUsers(users: AdminUser[]): void {
  save(KEYS.users, users);
  refreshBanCookies(users);
}

export function loadPosts(): AdminPost[] {
  return loadOrInit<AdminPost>(KEYS.posts, MOCK_ADMIN_POSTS);
}
export function savePosts(posts: AdminPost[]): void {
  save(KEYS.posts, posts);
  refreshPostStateCookie(posts);
}

export function loadComments(): AdminComment[] {
  return loadOrInit<AdminComment>(KEYS.comments, MOCK_ADMIN_COMMENTS);
}
export function saveComments(comments: AdminComment[]): void {
  save(KEYS.comments, comments);
}

export function loadReports(): AdminReport[] {
  return loadOrInit<AdminReport>(KEYS.reports, MOCK_ADMIN_REPORTS);
}
export function saveReports(reports: AdminReport[]): void {
  save(KEYS.reports, reports);
}

export function loadAuditLogs(): AdminAuditLog[] {
  return loadOrInit<AdminAuditLog>(KEYS.audit, MOCK_AUDIT_LOGS);
}
export function saveAuditLogs(logs: AdminAuditLog[]): void {
  save(KEYS.audit, logs);
}

export function loadRegistrations(): AdminRegistrationRequest[] {
  return loadOrInit<AdminRegistrationRequest>(KEYS.registrations, MOCK_REGISTRATIONS);
}
export function saveRegistrations(items: AdminRegistrationRequest[]): void {
  save(KEYS.registrations, items);
}

export function loadSensitiveWords(): SensitiveWord[] {
  return loadOrInit<SensitiveWord>(KEYS.sensitiveWords, MOCK_SENSITIVE_WORDS);
}
export function saveSensitiveWords(items: SensitiveWord[]): void {
  save(KEYS.sensitiveWords, items);
}

// ============================================================
// 审计日志辅助
// ============================================================

/** 任何 mock 数据变化后广播给同 tab 内监听者(主要是审计日志页) */
export const MOCK_CHANGED_EVENT = 'admin-mock-changed';

function broadcast(kind: string): void {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new CustomEvent(MOCK_CHANGED_EVENT, { detail: { kind } }));
  } catch {
    /* ignore */
  }
}

export function appendAuditLog(input: {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): void {
  const logs = loadAuditLogs();
  const entry: AdminAuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor: { id: 'hezhong233', username: 'hezhong233', role: 'superadmin' },
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
    ip: '127.0.0.1',
    createdAt: new Date().toISOString(),
  };
  saveAuditLogs([entry, ...logs]);
  broadcast('audit');
}

export { getCookie };
