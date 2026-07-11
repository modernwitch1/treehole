/**
 * 后端 API 客户端封装。
 * - 本地开发显式设置 NEXT_PUBLIC_USE_MOCK=true 时返回 mock 数据。
 * - 生产环境必须设置 NEXT_PUBLIC_USE_MOCK=false,默认使用真实接口。
 */

import {
  MOCK_COMMENTS_FOR_POST_102,
  MOCK_CONVERSATIONS,
  MOCK_CONVERSATION_DETAILS,
  MOCK_CURRENT_USER,
  MOCK_POSTS,
} from '@/data/mock';
import type {
  Board,
  Comment,
  Conversation,
  ConversationDetail,
  CurrentUser,
  NotificationItem,
  NotificationsPage,
  Page,
  Post,
  RegistrationRequest,
  RegistrationStatus,
  SortType,
  ChatroomDetail,
  ChatroomMessageDto,
} from '@/types/api';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
const CONFIGURED_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? (typeof window === 'undefined' ? 'http://127.0.0.1:3000' : '');
const BOOKMARK_KEY = 'forum_bookmarked_post_ids';
const MOCK_POST_STATE_COOKIE = 'forum_mock_post_states';
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'mock-notice-1',
    type: 'system',
    title: '欢迎来到浙工商树洞',
    body: '这里是系统通知栏。生产环境中，管理员发布的通知会同步出现在这里。',
    linkUrl: '/rules',
    readAt: null,
    createdAt: new Date().toISOString(),
  },
];

const MOCK_COMMENTS_BY_POST = new Map<string, Comment[]>();
MOCK_COMMENTS_BY_POST.set('102', MOCK_COMMENTS_FOR_POST_102);

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const serverCookieHeader = await getServerCookieHeader();
  const res = await fetch(`${apiBase()}/api/v1${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(serverCookieHeader ? { Cookie: serverCookieHeader } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText;
    try {
      const body = (await res.json()) as { code?: string; message?: string };
      code = body.code ?? code;
      message = body.message ?? message;
    } catch {}
    throw new ApiError(message, res.status, code);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

function apiBase(): string {
  if (
    typeof window !== 'undefined' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(CONFIGURED_API_BASE)
  ) {
    return '';
  }
  return CONFIGURED_API_BASE;
}

async function getServerCookieHeader(): Promise<string> {
  if (typeof window !== 'undefined') {
    return '';
  }
  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    return store
      .getAll()
      .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
      .join('; ');
  } catch {
    return '';
  }
}

function sortPosts(posts: Post[], sort: SortType): Post[] {
  const arr = [...posts];
  if (sort === 'new') {
    arr.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  } else if (sort === 'top') {
    arr.sort((a, b) => b.score - a.score);
  }
  // hot 已经按 mock 顺序; pinned 永远靠前
  arr.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  return arr;
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function applyAdminMockPostStates(posts: Post[]): Post[] {
  const raw = getCookie(MOCK_POST_STATE_COOKIE);
  if (!raw) return posts;
  try {
    const states = JSON.parse(raw) as Array<{
      id?: string;
      title?: string;
      status?: 'published' | 'pending_review' | 'hidden' | 'deleted';
      isPinned?: boolean;
      isLocked?: boolean;
    }>;
    const stateFor = (post: Post) =>
      states.find((s) => s.id === post.id || (s.title && s.title === post.title));
    return posts
      .map((post) => {
        const state = stateFor(post);
        if (!state) return post;
        return {
          ...post,
          isPinned: state.isPinned ?? post.isPinned,
          isLocked: state.isLocked ?? post.isLocked,
          __mockStatus: state.status,
        } as Post & { __mockStatus?: string };
      })
      .filter((post) => {
        const status = (post as Post & { __mockStatus?: string }).__mockStatus;
        return status !== 'hidden' && status !== 'deleted' && status !== 'pending_review';
      });
  } catch {
    return posts;
  }
}

function generateMockUsername(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `浙小商${suffix}`;
}

function appendImageMarkdown(contentMd: string, imageUrls?: string[]): string {
  const urls = imageUrls?.filter(Boolean) ?? [];
  if (urls.length === 0) return contentMd;
  const images = urls.map((url, index) => `![帖子图片 ${index + 1}](${url})`).join('\n\n');
  return `${contentMd}\n\n${images}`;
}

// ============================================================
// Posts
// ============================================================

export async function listPosts(opts: {
  tag?: string;
  q?: string;
  sort?: SortType;
  cursor?: string;
  limit?: number;
}): Promise<Page<Post>> {
  if (USE_MOCK) {
    let posts = applyAdminMockPostStates([...MOCK_POSTS]);
    if (opts.tag!) posts = posts.filter((p) => p.board.slug === opts.tag);
    if (opts.q) {
      const q = opts.q.toLowerCase();
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.contentExcerpt ?? p.contentMd ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = sortPosts(posts, opts.sort ?? 'hot');
    const pageSize = Math.min(Math.max(opts.limit ?? 20, 1), 20);
    const cursorIndex = opts.cursor
      ? sorted.findIndex((post) => post.id === opts.cursor)
      : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const items = sorted.slice(start, start + pageSize);
    const hasMore = start + items.length < sorted.length;
    return Promise.resolve({
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    });
  }
  const params = new URLSearchParams();
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  const base = opts.tag ? `/boards/${opts.tag}/posts` : '/posts';
  try {
    return await request(`${base}?${params.toString()}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { items: [] };
    }
    throw err;
  }
}

export async function createPost(data: {
  title: string;
  contentMd: string;
  boardSlug: string;
  isAnonymous?: boolean;
  imageUrls?: string[];
}): Promise<Post> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    const contentMd = appendImageMarkdown(data.contentMd, data.imageUrls);
    const isAnonymous = data.isAnonymous !== false;
    const post: Post = {
      id: `mock-${Date.now()}`,
      board: { slug: data.boardSlug, name: data.boardSlug, icon: '📚' },
      author: isAnonymous
        ? {
            type: 'anonymous',
            pseudonym: {
              displayName: '匿名 · 新同学',
              color: 'oklch(0.7 0.15 200)',
              isOp: true,
            },
          }
        : {
            type: 'user',
            user: {
              id: MOCK_CURRENT_USER.id,
              username: MOCK_CURRENT_USER.username,
              avatarUrl: MOCK_CURRENT_USER.avatarUrl,
            },
          },
      title: data.title,
      contentExcerpt: data.contentMd.slice(0, 200),
      contentMd,
      upvotes: 1,
      downvotes: 0,
      score: 1,
      commentCount: 0,
      isLocked: false,
      isPinned: false,
      createdAt: new Date().toISOString(),
      imageUrls: data.imageUrls,
      hasImages: Boolean(data.imageUrls?.length),
      thumbnailUrl: data.imageUrls?.[0],
    };
    // 把新帖子加到 mock 列表中，这样帖子详情页能找到它
    MOCK_POSTS.unshift(post);
    return post;
  }
  return request('/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function uploadPostImage(file: File): Promise<{ url: string }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    return {
      url: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      }),
    };
  }
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${apiBase()}/api/v1/uploads/post-image`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? '上传失败');
  }
  return res.json() as Promise<{ url: string }>;
}

export async function uploadChatroomImage(file: File): Promise<{ url: string }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    return {
      url: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      }),
    };
  }
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${apiBase()}/api/v1/uploads/chatroom-image`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? '上传失败');
  }
  return res.json() as Promise<{ url: string }>;
}

export async function votePost(postId: string, value: 1 | -1 | 0): Promise<void> {
  if (USE_MOCK) {
    const post = MOCK_POSTS.find((p) => p.id === postId);
    if (post) {
      const prev = post.myVote ?? 0;
      if (prev === 1) post.upvotes -= 1;
      if (prev === -1) post.downvotes -= 1;
      post.myVote = value || undefined;
      if (value === 1) post.upvotes += 1;
      if (value === -1) post.downvotes += 1;
      post.score = post.upvotes - post.downvotes;
    }
    return;
  }
  await request(`/posts/${postId}/vote`, { method: 'POST', body: JSON.stringify({ value }) });
}

export async function toggleBookmark(postId: string): Promise<{ bookmarked: boolean }> {
  if (typeof window === 'undefined') return { bookmarked: false };
  const current = new Set(
    (window.localStorage.getItem(BOOKMARK_KEY) ?? '').split(',').filter(Boolean),
  );
  const bookmarked = !current.has(postId);
  if (bookmarked) current.add(postId);
  else current.delete(postId);
  window.localStorage.setItem(BOOKMARK_KEY, Array.from(current).join(','));
  return { bookmarked };
}

export async function getPost(id: string): Promise<Post | undefined> {
  if (USE_MOCK)
    return Promise.resolve(applyAdminMockPostStates([...MOCK_POSTS]).find((p) => p.id === id));
  return request(`/posts/${id}`);
}

// ============================================================
// Comments
// ============================================================

export async function listComments(postId: string, opts?: { cursor?: string }): Promise<Page<Comment>> {
  if (USE_MOCK) {
    const comments = MOCK_COMMENTS_BY_POST.get(postId) ?? [];
    return Promise.resolve({ items: comments });
  }
  const params = new URLSearchParams();
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const query = params.toString();
  return request(`/posts/${postId}/comments${query ? `?${query}` : ''}`);
}

export async function createComment(data: {
  postId: string;
  contentMd: string;
  parentId?: string;
  isAnonymous?: boolean;
}): Promise<Comment> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    const comment: Comment = {
      id: `comment-mock-${Date.now()}`,
      postId: data.postId,
      parentId: data.parentId,
      author: {
        type: 'anonymous',
        pseudonym: { displayName: '匿名 · 新同学', color: 'oklch(0.65 0.14 190)', isOp: false },
      },
      contentMd: data.contentMd,
      contentHtml: `<p>${data.contentMd}</p>`,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      isDeleted: false,
      depth: data.parentId ? 1 : 0,
      createdAt: new Date().toISOString(),
      replies: [],
    };
    const list = MOCK_COMMENTS_BY_POST.get(data.postId) ?? [];
    if (data.parentId) {
      const parent = findComment(list, data.parentId);
      if (parent) parent.replies = [...(parent.replies ?? []), comment];
      else list.push(comment);
    } else {
      list.push(comment);
    }
    MOCK_COMMENTS_BY_POST.set(data.postId, list);
    const post = MOCK_POSTS.find((p) => p.id === data.postId);
    if (post) post.commentCount += 1;
    return comment;
  }
  return request(`/posts/${data.postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      contentMd: data.contentMd,
      parentId: data.parentId,
      isAnonymous: data.isAnonymous ?? true,
    }),
  });
}

export async function voteComment(commentId: string, value: 1 | -1 | 0): Promise<void> {
  if (USE_MOCK) {
    for (const comments of MOCK_COMMENTS_BY_POST.values()) {
      const comment = findComment(comments, commentId);
      if (comment) {
        const prev = comment.myVote ?? 0;
        if (prev === 1) comment.upvotes -= 1;
        if (prev === -1) comment.downvotes -= 1;
        comment.myVote = value || undefined;
        if (value === 1) comment.upvotes += 1;
        if (value === -1) comment.downvotes += 1;
        comment.score = comment.upvotes - comment.downvotes;
        break;
      }
    }
    return;
  }
  await request(`/comments/${commentId}/vote`, { method: 'POST', body: JSON.stringify({ value }) });
}

export async function reportTarget(data: {
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
  reason?: string;
}): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 250));
    return { ok: true };
  }
  return request('/reports', { method: 'POST', body: JSON.stringify(data) });
}

function findComment(comments: Comment[], id: string): Comment | undefined {
  for (const comment of comments) {
    if (comment.id === id) return comment;
    const child = comment.replies ? findComment(comment.replies, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

// ============================================================
// Current user
// ============================================================

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (USE_MOCK) {
    // mock 模式下始终返回用户（中间件负责拦截未登录请求）
    return Promise.resolve(MOCK_CURRENT_USER);
  }
  try {
    return await request('/users/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

// ============================================================
// 私信
// ============================================================

export async function listConversations(opts?: { cursor?: string }): Promise<{ items: Conversation[]; nextCursor?: string }> {
  if (USE_MOCK) {
    const sorted = [...MOCK_CONVERSATIONS].sort(
      (a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt),
    );
    return Promise.resolve({ items: sorted });
  }
  const params = new URLSearchParams();
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const query = params.toString();
  return request(`/messages/conversations${query ? `?${query}` : ''}`);
}

export async function getConversation(id: string): Promise<ConversationDetail | undefined> {
  if (USE_MOCK) return Promise.resolve(MOCK_CONVERSATION_DETAILS[id]);
  return request(`/messages/conversations/${id}`);
}

export interface SendMessageResult {
  ok: boolean;
  error?: 'partner_dm_disabled' | 'rate_limited_pending' | 'blocked';
  message?: string;
}

export async function sendMessage(
  conversationId: string,
  contentMd: string,
): Promise<SendMessageResult> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    return Promise.resolve({ ok: true });
  }
  return request(`/messages/conversations/${conversationId}`, {
    method: 'POST',
    body: JSON.stringify({ contentMd }),
  });
}

export interface InitiateConversationParams {
  originPostId: string;
  initialMessage: string;
}

export async function initiateConversation(
  params: InitiateConversationParams,
): Promise<SendMessageResult & { conversationId?: string }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 350));
    if (params.originPostId === '109') {
      return { ok: false, error: 'partner_dm_disabled' };
    }
    return { ok: true, conversationId: 'conv-1' };
  }
  return request('/messages/conversations', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function setDmAllowed(allowed: boolean): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 250));
    MOCK_CURRENT_USER.dmAllowed = allowed;
    return { ok: true };
  }
  return request('/users/me/dm-settings', {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  });
}

// ============================================================
// Notifications
// ============================================================

export async function listNotifications(opts?: { cursor?: string }): Promise<NotificationsPage & { nextCursor?: string }> {
  if (USE_MOCK) {
    return {
      items: MOCK_NOTIFICATIONS,
      unreadCount: MOCK_NOTIFICATIONS.filter((item) => !item.readAt).length,
    };
  }
  const params = new URLSearchParams();
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const query = params.toString();
  return request(`/notifications${query ? `?${query}` : ''}`);
}

export async function markNotificationRead(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) {
    const item = MOCK_NOTIFICATIONS.find((notification) => notification.id === id);
    if (item && !item.readAt) item.readAt = new Date().toISOString();
    return { ok: true };
  }
  return request(`/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<{ ok: true }> {
  if (USE_MOCK) {
    const now = new Date().toISOString();
    MOCK_NOTIFICATIONS.forEach((notification) => {
      notification.readAt = notification.readAt ?? now;
    });
    return { ok: true };
  }
  return request('/notifications/read-all', { method: 'POST' });
}

export async function blockConversation(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 250));
    return { ok: true };
  }
  return request(`/messages/conversations/${id}/block`, { method: 'POST' });
}

// ============================================================
// Registration (注册/审批)
// ============================================================

const MOCK_REGISTRATIONS_MAP = new Map<
  string,
  RegistrationRequest & { verificationCode?: string }
>();

// 预置一个普通用户测试账号
MOCK_REGISTRATIONS_MAP.set('hezhong233', {
  id: 'reg-seed-1',
  studentId: 'hezhong233',
  email: 'hezhong233@pop.zjgsu.edu.cn',
  username: 'hezhong233',
  method: 'email' as const,
  status: 'approved',
  createdAt: new Date(Date.now() - 86400 * 1000).toISOString(),
  expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
});

export async function uploadScreenshot(file: File): Promise<{ url: string }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400));
    return {
      url: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(file.name)}`,
    };
  }
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${apiBase()}/api/v1/uploads/registration`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? '上传失败');
  }
  return res.json() as Promise<{ url: string }>;
}

export async function submitRegistration(data: {
  studentId: string;
  email?: string;
  username?: string;
  password: string;
  realName?: string;
  method: 'email' | 'screenshot';
  screenshotUrl?: string;
}): Promise<RegistrationRequest> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const verificationCode = data.method === 'email' ? '123456' : undefined;
    const req: RegistrationRequest & { verificationCode?: string } = {
      id: `reg-mock-${Date.now()}`,
      studentId: data.studentId,
      email: data.email ?? `${data.studentId}@pop.zjgsu.edu.cn`,
      username: generateMockUsername(),
      realName: data.realName,
      screenshotUrl: data.screenshotUrl,
      method: data.method,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt,
      verificationCode,
    };
    MOCK_REGISTRATIONS_MAP.set(data.studentId, req);
    return {
      id: req.id,
      studentId: req.studentId,
      email: req.email,
      username: req.username,
      realName: req.realName,
      screenshotUrl: req.screenshotUrl,
      method: req.method,
      status: req.status,
      createdAt: req.createdAt,
      expiresAt: req.expiresAt,
    };
  }
  return request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

export async function verifyEmailCode(
  studentId: string,
  code: string,
): Promise<{ ok: boolean; message?: string }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    const existing = MOCK_REGISTRATIONS_MAP.get(studentId);
    if (!existing) {
      return { ok: false, message: '未找到注册记录' };
    }
    if (existing.verificationCode !== code) {
      return { ok: false, message: '验证码错误' };
    }
    existing.status = 'approved';
    return { ok: true };
  }
  return request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ studentId, code }),
  });
}

export async function checkRegistration(
  studentId: string,
  password: string,
): Promise<{
  status: RegistrationStatus;
  request?: RegistrationRequest;
  message?: string;
}> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400));
    const existing = MOCK_REGISTRATIONS_MAP.get(studentId);
    if (!existing) {
      return { status: 'not_registered', message: '该学号尚未注册' };
    }
    const expired = new Date(existing.expiresAt).getTime() < Date.now();
    if (expired && existing.status === 'pending') {
      existing.status = 'expired';
      return { status: 'expired', request: existing, message: '注册申请已过期,请重新提交' };
    }
    return { status: existing.status, request: existing };
  }
  return request('/auth/check-registration', {
    method: 'POST',
    body: JSON.stringify({ studentId, password }),
  });
}

export async function login(
  studentId: string,
  password: string,
): Promise<{
  status: RegistrationStatus;
  request?: RegistrationRequest;
  message?: string;
}> {
  if (USE_MOCK) {
    return checkRegistration(studentId, password);
  }
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ studentId, password }),
  });
}

export async function logout(): Promise<{ ok: true }> {
  if (USE_MOCK) {
    return { ok: true };
  }
  return request('/auth/logout', { method: 'POST' });
}

export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true };
  }
  return request('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ============================================================
// Chatrooms (在线聊天房)
// ============================================================

export async function getChatrooms(): Promise<ChatroomDetail[]> {
  if (USE_MOCK) {
    return [];
  }
  return request('/chatrooms');
}

export async function getChatroomDetail(uid: string): Promise<ChatroomDetail> {
  if (USE_MOCK) {
    throw new Error('Not implemented');
  }
  return request(`/chatrooms/${uid}`);
}

export async function createChatroom(data: {
  title: string;
  description?: string;
  avatarUrl?: string;
  backgroundUrl?: string;
}): Promise<ChatroomDetail> {
  if (USE_MOCK) {
    throw new Error('Not implemented');
  }
  return request('/chatrooms', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function closeChatroom(uid: string): Promise<void> {
  if (USE_MOCK) {
    return;
  }
  return request(`/chatrooms/${uid}/close`, { method: 'POST' });
}

export async function getChatroomMessages(
  uid: string,
  afterId?: string,
): Promise<ChatroomMessageDto[]> {
  if (USE_MOCK) {
    return [];
  }
  const query = afterId ? `?afterId=${encodeURIComponent(afterId)}` : '';
  return request(`/chatrooms/${uid}/messages${query}`);
}

export async function sendChatroomMessage(
  uid: string,
  content: string,
): Promise<ChatroomMessageDto> {
  if (USE_MOCK) {
    throw new Error('Not implemented');
  }
  return request(`/chatrooms/${uid}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

// ============================================================
// Boards (板块)
// ============================================================

export async function listBoards(): Promise<Board[]> {
  if (USE_MOCK) {
    return Promise.resolve([
      { id: '1', slug: 'zheng-neng-liang', name: '正能量', icon: '🏫', color: 'blue', description: '校内新鲜事、活动公告、正能量分享', allowsAnonymous: true, postCount: 80, subscriberCount: 1200 },
      { id: '2', slug: 'campus', name: '校园生活', icon: '📚', color: 'green', description: '校园日常、学习生活、趣事分享', allowsAnonymous: true, postCount: 128, subscriberCount: 567 },
      { id: '3', slug: 'course', name: '选课交流', icon: '💬', color: 'teal', description: '选课推荐、课程评价、学习经验', allowsAnonymous: true, postCount: 89, subscriberCount: 423 },
      { id: '4', slug: 'trade', name: '二手交易', icon: '🛒', color: 'amber', description: '闲置物品买卖、求购信息', allowsAnonymous: false, postCount: 256, subscriberCount: 890 },
      { id: '5', slug: 'job', name: '实习就业', icon: '💼', color: 'purple', description: '实习招聘、求职经验、内推信息', allowsAnonymous: false, postCount: 67, subscriberCount: 345 },
      { id: '6', slug: 'emotion', name: '情感天地', icon: '❤️', color: 'pink', description: '倾诉、树洞、情感话题', allowsAnonymous: true, postCount: 178, subscriberCount: 678 },
      { id: '7', slug: 'exam', name: '考研考公', icon: '📖', color: 'indigo', description: '考研/考公/考证经验交流', allowsAnonymous: true, postCount: 92, subscriberCount: 456 },
      { id: '8', slug: 'feedback', name: '站务反馈', icon: '📝', color: 'gray', description: '建议、BUG 反馈、投诉', allowsAnonymous: false, postCount: 34, subscriberCount: 123 },
    ]);
  }
  return request('/boards');
}

export async function getBoard(slug: string): Promise<Board> {
  if (USE_MOCK) {
    const boards = await listBoards();
    const board = boards.find((b) => b.slug === slug);
    if (!board) throw new Error('板块不存在');
    return board;
  }
  return request(`/boards/${slug}`);
}

export async function applyForBoard(data: {
  name: string;
  description: string;
  reason: string;
}): Promise<{ ok: boolean }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    return { ok: true };
  }
  return request('/boards', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export { ApiError };
