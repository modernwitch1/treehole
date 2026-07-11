/**
 * Admin API 客户端封装。
 * - 本地开发显式设置 NEXT_PUBLIC_USE_MOCK=true 时返回 mock 数据。
 * - mock 模式下所有 mutation 通过 lib/mock-store 写 localStorage,保证跨页面/刷新可见。
 * - 后端 Slice 10 实装后切换即可,本文件 mock 分支会被忽略。
 */

import { MOCK_ADMIN_USER, MOCK_STATS } from '@/data/mock';
import {
  loadUsers,
  saveUsers,
  loadPosts,
  savePosts,
  loadComments,
  saveComments,
  loadReports,
  saveReports,
  loadAuditLogs,
  loadRegistrations,
  saveRegistrations,
  loadSensitiveWords,
  saveSensitiveWords,
  appendAuditLog,
} from './mock-store';
import type {
  AdminAuditLog,
  AdminComment,
  AdminCurrentUser,
  AdminPost,
  AdminRegistrationRequest,
  AdminReport,
  AdminStats,
  AdminUser,
  BoardApplication,
  ContentStatus,
  ReportStatus,
  SensitiveWord,
  SensitiveWordAction,
  SensitiveWordCategory,
  SystemAnnouncement,
  UserStatus,
} from '@/types/admin';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const MOCK_ANNOUNCEMENTS: SystemAnnouncement[] = [];

function apiBase(): string {
  if (
    typeof window !== 'undefined' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(CONFIGURED_API_BASE)
  ) {
    return '';
  }
  return CONFIGURED_API_BASE;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${apiBase()}/api/v1${path}`, {
    credentials: 'include',
    headers,
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? res.statusText);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ============================================================
// Admin login
// ============================================================

export async function adminLogin(
  username: string,
  password: string,
  totpCode?: string,
): Promise<{ ok: true; token?: string }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    if (!username.trim() || !password.trim()) {
      throw new Error('管理员账号或密码错误');
    }
    return { ok: true, token: 'mock-admin-token' };
  }
  return request('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, totpCode }),
  });
}

export async function adminLogout(): Promise<{ ok: true }> {
  if (USE_MOCK) {
    return { ok: true };
  }
  return request('/admin/logout', { method: 'POST' });
}

// ============================================================
// Current admin
// ============================================================

export async function getCurrentAdmin(): Promise<AdminCurrentUser | null> {
  if (USE_MOCK) return Promise.resolve(MOCK_ADMIN_USER);
  try {
    return await request('/admin/me');
  } catch {
    return null;
  }
}

// ============================================================
// Stats
// ============================================================

export async function getStats(): Promise<AdminStats> {
  if (USE_MOCK) {
    // pendingRegistrations 必须从当前 mock 数据动态算 — 只统计真正待审批(未过期)的
    const regs = loadRegistrations();
    const now = Date.now();
    const pending = regs.filter(
      (r) => r.status === 'pending' && new Date(r.expiresAt).getTime() > now,
    ).length;
    const reports = loadReports();
    const openReports = reports.filter((r) => r.status === 'open').length;
    return Promise.resolve({
      ...MOCK_STATS,
      pendingRegistrations: pending,
      openReports,
    });
  }
  return request('/admin/stats');
}

// ============================================================
// Users
// ============================================================

export async function listUsers(
  opts: {
    q?: string;
    status?: UserStatus;
    role?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ items: AdminUser[]; total: number; page: number; pageSize: number; totalPages: number }> {
  if (USE_MOCK) {
    let users = loadUsers();
    if (opts.q) {
      const q = opts.q.toLowerCase();
      users = users.filter(
        (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    if (opts.status) users = users.filter((u) => u.status === opts.status);
    if (opts.role) users = users.filter((u) => u.role === opts.role);
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const items = users.slice(start, start + pageSize);
    return Promise.resolve({
      items,
      total: users.length,
      page,
      pageSize,
      totalPages: Math.ceil(users.length / pageSize),
    });
  }
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.status) params.set('status', opts.status);
  if (opts.role) params.set('role', opts.role);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  return request(`/admin/users?${params.toString()}`);
}

export async function suspendUser(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (user) {
      user.status = 'suspended';
      user.suspendedUntil = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      saveUsers(users);
      appendAuditLog({
        action: 'user.suspend',
        targetType: 'user',
        targetId: id,
        metadata: { username: user.username, days: 7 },
      });
    }
    return { ok: true };
  }
  return request(`/admin/users/${id}/suspend`, { method: 'POST' });
}

export async function banUser(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (user) {
      user.status = 'banned';
      saveUsers(users);
      appendAuditLog({
        action: 'user.ban',
        targetType: 'user',
        targetId: id,
        metadata: { username: user.username },
      });
    }
    return { ok: true };
  }
  return request(`/admin/users/${id}/ban`, { method: 'POST' });
}

export async function unbanUser(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (user) {
      user.status = 'active';
      user.suspendedUntil = null;
      saveUsers(users);
      appendAuditLog({
        action: 'user.unban',
        targetType: 'user',
        targetId: id,
        metadata: { username: user.username },
      });
    }
    return { ok: true };
  }
  return request(`/admin/users/${id}/unban`, { method: 'POST' });
}

export async function setUserRole(id: string, role: 'moderator' | 'user'): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (user) {
      const oldRole = user.role;
      user.role = role;
      saveUsers(users);
      appendAuditLog({
        action: role === 'moderator' ? 'user.promote' : 'user.demote',
        targetType: 'user',
        targetId: id,
        metadata: { username: user.username, from: oldRole, to: role },
      });
    }
    return { ok: true };
  }
  return request(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

// ============================================================
// Reports
// ============================================================

export async function listReports(opts: { status?: ReportStatus; page?: number; pageSize?: number } = {}): Promise<{ items: AdminReport[]; total: number; page: number; pageSize: number; totalPages: number }> {
  if (USE_MOCK) {
    let reports = loadReports();
    if (opts.status) reports = reports.filter((r) => r.status === opts.status);
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const items = reports.slice(start, start + pageSize);
    return Promise.resolve({
      items,
      total: reports.length,
      page,
      pageSize,
      totalPages: Math.ceil(reports.length / pageSize),
    });
  }
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  return request(`/admin/reports?${params.toString()}`);
}

export async function reviewReport(
  id: string,
  action: 'hide' | 'resolve' | 'reject',
  note?: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    const reports = loadReports();
    const report = reports.find((r) => r.id === id);
    if (report) {
      if (action === 'resolve' || action === 'reject') {
        report.status = action === 'resolve' ? 'resolved' : 'rejected';
        report.handledBy = { id: 'admin-1', username: '管理员·小何' };
        report.handledAt = new Date().toISOString();
        report.resolutionNote = note;
      }
      // hide: 同时把对应内容 status 改为 hidden
      if (action === 'hide') {
        if (report.targetType === 'post') {
          const posts = loadPosts();
          const p = posts.find((x) => x.id === report.targetId);
          if (p) {
            p.status = 'hidden';
            savePosts(posts);
          }
        } else if (report.targetType === 'comment') {
          const comments = loadComments();
          const c = comments.find((x) => x.id === report.targetId);
          if (c) {
            c.status = 'hidden';
            saveComments(comments);
          }
        }
      }
      saveReports(reports);
      appendAuditLog({
        action: `report.${action}`,
        targetType: 'report',
        targetId: id,
        metadata: { note, targetType: report.targetType, targetId: report.targetId },
      });
    }
    return { ok: true };
  }
  return request(`/admin/reports/${id}`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  });
}

// ============================================================
// Posts / Comments — 内容管理
// ============================================================

export async function listAdminPosts(opts: { page?: number; pageSize?: number } = {}): Promise<{ items: AdminPost[]; total: number; page: number; pageSize: number; totalPages: number }> {
  if (USE_MOCK) {
    const posts = loadPosts();
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const items = posts.slice(start, start + pageSize);
    return Promise.resolve({
      items,
      total: posts.length,
      page,
      pageSize,
      totalPages: Math.ceil(posts.length / pageSize),
    });
  }
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  return request(`/admin/posts?${params.toString()}`);
}

export async function listAdminComments(opts: { page?: number; pageSize?: number } = {}): Promise<{ items: AdminComment[]; total: number; page: number; pageSize: number; totalPages: number }> {
  if (USE_MOCK) {
    const comments = loadComments();
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const items = comments.slice(start, start + pageSize);
    return Promise.resolve({
      items,
      total: comments.length,
      page,
      pageSize,
      totalPages: Math.ceil(comments.length / pageSize),
    });
  }
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  return request(`/admin/comments?${params.toString()}`);
}

export interface RevealedIdentity {
  id: string;
  username: string;
  email: string;
}

export async function revealContentAuthor(
  kind: 'post' | 'comment',
  id: string,
): Promise<RevealedIdentity> {
  if (USE_MOCK) {
    return {
      id: 'mock-author',
      username: '浙小商Mock',
      email: 'mock@pop.zjgsu.edu.cn',
    };
  }
  const path = kind === 'post' ? `/admin/posts/${id}/identity` : `/admin/comments/${id}/identity`;
  return request(path);
}

async function mutatePost(
  id: string,
  mutate: (p: AdminPost) => void,
  action: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const posts = loadPosts();
    const p = posts.find((x) => x.id === id);
    if (p) {
      mutate(p);
      savePosts(posts);
      appendAuditLog({ action, targetType: 'post', targetId: id, metadata: { title: p.title } });
    }
    return { ok: true };
  }
  return request(`/admin/posts/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
}

export const hidePost = (id: string) =>
  mutatePost(
    id,
    (p) => {
      p.status = 'hidden';
    },
    'post.hide',
  );

export const restorePost = (id: string) =>
  mutatePost(
    id,
    (p) => {
      p.status = 'published';
    },
    'post.restore',
  );

export const deletePost = (id: string) =>
  mutatePost(
    id,
    (p) => {
      p.status = 'deleted';
    },
    'post.delete',
  );

export const pinPost = (id: string) =>
  mutatePost(
    id,
    (p) => {
      p.isPinned = true;
    },
    'post.pin',
  );

export const unpinPost = (id: string) =>
  mutatePost(
    id,
    (p) => {
      p.isPinned = false;
    },
    'post.unpin',
  );

export const lockPost = (id: string) =>
  mutatePost(
    id,
    (p) => {
      p.isLocked = true;
    },
    'post.lock',
  );

export const unlockPost = (id: string) =>
  mutatePost(
    id,
    (p) => {
      p.isLocked = false;
    },
    'post.unlock',
  );

async function mutateComment(
  id: string,
  mutate: (c: AdminComment) => void,
  action: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const comments = loadComments();
    const c = comments.find((x) => x.id === id);
    if (c) {
      mutate(c);
      saveComments(comments);
      appendAuditLog({
        action,
        targetType: 'comment',
        targetId: id,
        metadata: { excerpt: c.excerpt.slice(0, 80) },
      });
    }
    return { ok: true };
  }
  return request(`/admin/comments/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
}

export const hideComment = (id: string) =>
  mutateComment(
    id,
    (c) => {
      c.status = 'hidden';
    },
    'comment.hide',
  );

export const restoreComment = (id: string) =>
  mutateComment(
    id,
    (c) => {
      c.status = 'published';
    },
    'comment.restore',
  );

export const deleteComment = (id: string) =>
  mutateComment(
    id,
    (c) => {
      c.status = 'deleted';
    },
    'comment.delete',
  );

/** 通用 dispatcher — 给 ContentActionsMenu 用 */
export async function applyContentAction(
  kind: 'post' | 'comment',
  id: string,
  action: 'hide' | 'restore' | 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete',
): Promise<{ ok: true }> {
  if (kind === 'post') {
    switch (action) {
      case 'hide':
        return hidePost(id);
      case 'restore':
        return restorePost(id);
      case 'pin':
        return pinPost(id);
      case 'unpin':
        return unpinPost(id);
      case 'lock':
        return lockPost(id);
      case 'unlock':
        return unlockPost(id);
      case 'delete':
        return deletePost(id);
    }
  } else {
    switch (action) {
      case 'hide':
        return hideComment(id);
      case 'restore':
        return restoreComment(id);
      case 'delete':
        return deleteComment(id);
      default:
        throw new Error(`不支持的评论动作: ${action}`);
    }
  }
}

// ============================================================
// Audit logs
// ============================================================

export async function listAuditLogs(opts: { page?: number; pageSize?: number } = {}): Promise<{ items: AdminAuditLog[]; total: number; page: number; pageSize: number; totalPages: number }> {
  if (USE_MOCK) {
    const logs = loadAuditLogs();
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const items = logs.slice(start, start + pageSize);
    return Promise.resolve({
      items,
      total: logs.length,
      page,
      pageSize,
      totalPages: Math.ceil(logs.length / pageSize),
    });
  }
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  return request(`/admin/audit-logs?${params.toString()}`);
}

// ============================================================
// Announcements (站内通知)
// ============================================================

export async function listAnnouncements(opts: { page?: number; pageSize?: number } = {}): Promise<{ items: SystemAnnouncement[]; total: number; page: number; pageSize: number; totalPages: number }> {
  if (USE_MOCK) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const items = MOCK_ANNOUNCEMENTS.slice(start, start + pageSize);
    return Promise.resolve({
      items,
      total: MOCK_ANNOUNCEMENTS.length,
      page,
      pageSize,
      totalPages: Math.ceil(MOCK_ANNOUNCEMENTS.length / pageSize),
    });
  }
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  return request(`/admin/announcements?${params.toString()}`);
}

export async function publishAnnouncement(input: {
  title: string;
  body: string;
  linkUrl?: string;
}): Promise<{ ok: true; announcement: SystemAnnouncement }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 250));
    const announcement: SystemAnnouncement = {
      id: `ann-${Date.now()}`,
      title: input.title.trim(),
      body: input.body.trim(),
      linkUrl: input.linkUrl?.trim() || undefined,
      audience: 'all',
      recipientCount: loadUsers().filter((user) => user.status === 'active').length,
      publishedBy: MOCK_ADMIN_USER.username,
      createdAt: new Date().toISOString(),
    };
    MOCK_ANNOUNCEMENTS.unshift(announcement);
    appendAuditLog({
      action: 'announcement.publish',
      targetType: 'announcement',
      targetId: announcement.id,
      metadata: { title: announcement.title, recipientCount: announcement.recipientCount },
    });
    return { ok: true, announcement };
  }
  return request('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ============================================================
// Registration management
// ============================================================

export async function listRegistrations(): Promise<AdminRegistrationRequest[]> {
  if (USE_MOCK) {
    const now = Date.now();
    return loadRegistrations().map((r) => ({
      ...r,
      remainingHours: Math.round((new Date(r.expiresAt).getTime() - now) / 3600000),
    }));
  }
  return request('/admin/registrations');
}

export async function reviewRegistration(
  id: string,
  action: 'approve' | 'reject',
  note?: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    const items = loadRegistrations();
    const req = items.find((r) => r.id === id);
    if (req) {
      req.status = action === 'approve' ? 'approved' : 'rejected';
      req.reviewedAt = new Date().toISOString();
      req.reviewedBy = { id: 'admin-1', username: '管理员·小何' };
      req.reviewNote = note;
      saveRegistrations(items);
      appendAuditLog({
        action: `registration.${action}`,
        targetType: 'registration',
        targetId: id,
        metadata: { studentId: req.studentId, username: req.username, note },
      });
    }
    return { ok: true };
  }
  return request(`/admin/registrations/${id}`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  });
}

// 仅为类型导出
export type { ContentStatus };

// ============================================================
// Sensitive words (敏感词)
// ============================================================

export async function listSensitiveWords(
  opts: {
    q?: string;
    category?: SensitiveWordCategory;
    action?: SensitiveWordAction;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ items: SensitiveWord[]; total: number; page: number; pageSize: number; totalPages: number }> {
  if (USE_MOCK) {
    let items = loadSensitiveWords();
    if (opts.q) {
      const q = opts.q.toLowerCase();
      items = items.filter(
        (w) => w.word.toLowerCase().includes(q) || (w.note ?? '').toLowerCase().includes(q),
      );
    }
    if (opts.category) items = items.filter((w) => w.category === opts.category);
    if (opts.action) items = items.filter((w) => w.action === opts.action);
    if (opts.enabled !== undefined) items = items.filter((w) => w.enabled === opts.enabled);
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    return Promise.resolve({
      items: pageItems,
      total: items.length,
      page,
      pageSize,
      totalPages: Math.ceil(items.length / pageSize),
    });
  }
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.category) params.set('category', opts.category);
  if (opts.action) params.set('action', opts.action);
  if (opts.enabled !== undefined) params.set('enabled', String(opts.enabled));
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  return request(`/admin/sensitive-words?${params.toString()}`);
}

export async function createSensitiveWord(input: {
  word: string;
  category: SensitiveWordCategory;
  action: SensitiveWordAction;
  note?: string;
}): Promise<SensitiveWord> {
  const trimmed = input.word.trim();
  if (!trimmed) throw new Error('敏感词不能为空');
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const items = loadSensitiveWords();
    const exists = items.find((w) => w.word.toLowerCase() === trimmed.toLowerCase());
    if (exists) throw new Error(`敏感词 "${trimmed}" 已存在`);
    const now = new Date().toISOString();
    const word: SensitiveWord = {
      id: `sw-${Date.now()}`,
      word: trimmed,
      category: input.category,
      action: input.action,
      hitCount: 0,
      enabled: true,
      createdBy: '管理员·小何',
      createdAt: now,
      updatedAt: now,
      note: input.note?.trim() || undefined,
    };
    saveSensitiveWords([word, ...items]);
    appendAuditLog({
      action: 'sensitive-word.create',
      targetType: 'sensitive-word',
      targetId: word.id,
      metadata: { word: trimmed, category: input.category, ruleAction: input.action },
    });
    return word;
  }
  return request('/admin/sensitive-words', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateSensitiveWord(
  id: string,
  patch: Partial<Pick<SensitiveWord, 'word' | 'category' | 'action' | 'enabled' | 'note'>>,
): Promise<SensitiveWord> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const items = loadSensitiveWords();
    const w = items.find((x) => x.id === id);
    if (!w) throw new Error('敏感词不存在');
    if (patch.word !== undefined) w.word = patch.word.trim();
    if (patch.category !== undefined) w.category = patch.category;
    if (patch.action !== undefined) w.action = patch.action;
    if (patch.enabled !== undefined) w.enabled = patch.enabled;
    if (patch.note !== undefined) w.note = patch.note.trim() || undefined;
    w.updatedAt = new Date().toISOString();
    saveSensitiveWords(items);
    appendAuditLog({
      action: 'sensitive-word.update',
      targetType: 'sensitive-word',
      targetId: id,
      metadata: { word: w.word, patch },
    });
    return w;
  }
  return request(`/admin/sensitive-words/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteSensitiveWord(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const items = loadSensitiveWords();
    const w = items.find((x) => x.id === id);
    const next = items.filter((x) => x.id !== id);
    saveSensitiveWords(next);
    if (w) {
      appendAuditLog({
        action: 'sensitive-word.delete',
        targetType: 'sensitive-word',
        targetId: id,
        metadata: { word: w.word },
      });
    }
    return { ok: true };
  }
  return request(`/admin/sensitive-words/${id}`, { method: 'DELETE' });
}

/** 模拟热重载: 触发后端把 Redis 词库刷新一遍。mock 模式仅写审计日志。 */
export async function reloadSensitiveWords(): Promise<{ ok: true; count: number }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400));
    const items = loadSensitiveWords();
    const count = items.filter((w) => w.enabled).length;
    appendAuditLog({
      action: 'sensitive-word.reload',
      targetType: 'sensitive-word',
      metadata: { count },
    });
    return { ok: true, count };
  }
  return request('/admin/sensitive-words/reload', { method: 'POST' });
}

// ============================================================
// Chatrooms (在线聊天房监控)
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
  senderIp: string;
  isFlagged: boolean;
  senderNickname: string;
  senderAvatar: string;
  realSender?: {
    userId: string;
    username: string;
    studentId: string;
    email: string;
    role: string;
  };
}

export async function adminGetChatrooms(): Promise<ChatroomDetail[]> {
  if (USE_MOCK) {
    return [];
  }
  return request('/admin/chatrooms');
}

export async function adminGetChatroomMessages(
  uid: string,
  afterId?: string,
): Promise<ChatroomMessageDto[]> {
  if (USE_MOCK) {
    return [];
  }
  const query = afterId ? `?afterId=${encodeURIComponent(afterId)}` : '';
  return request(`/admin/chatrooms/${uid}/messages${query}`);
}

export async function adminFlagMessage(messageId: string): Promise<void> {
  if (USE_MOCK) {
    return;
  }
  return request(`/admin/chatrooms/messages/${messageId}/flag`, { method: 'POST' });
}

export async function adminCloseChatroom(uid: string): Promise<void> {
  if (USE_MOCK) {
    return;
  }
  return request(`/admin/chatrooms/${uid}/close`, { method: 'POST' });
}

export interface AdminFlaggedMessageDto {
  id: string;
  chatroomUid: string;
  chatroomTitle: string;
  content: string;
  senderIp: string;
  studentId: string;
  senderNickname: string;
  createdAt: string;
}

export async function adminGetFlaggedMessages(): Promise<AdminFlaggedMessageDto[]> {
  if (USE_MOCK) {
    return [];
  }
  return request('/admin/chatrooms/flagged-messages');
}

// ============================================================
// Board Applications (板块申请)
// ============================================================

export async function listBoardApplications(): Promise<BoardApplication[]> {
  if (USE_MOCK) {
    return Promise.resolve([]);
  }
  return request('/boards/pending');
}

export async function approveBoardApplication(id: string): Promise<{ ok: boolean }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true };
  }
  return request(`/boards/${id}/approve`, { method: 'POST' });
}

export async function rejectBoardApplication(id: string, reason?: string): Promise<{ ok: boolean }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true };
  }
  return request(`/boards/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
