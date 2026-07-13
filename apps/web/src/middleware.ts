import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 检查是否有近期登录态 cookie；无登录态默认先去登录页。
const IS_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

// admin 端通过这两个 cookie 同步封禁/禁言状态(参见 apps/admin/src/lib/mock-store.ts)
const BAN_COOKIE = 'forum_banned_user_ids';
const SUSPEND_COOKIE = 'forum_suspended_user_ids';
const USER_ACCESS_COOKIE = 'forum_access_token';
const USER_REFRESH_COOKIE = 'forum_refresh_token';

// mock 模式下当前登录用户固定是 hezhong233(见 mock.ts MOCK_CURRENT_USER)
const MOCK_CURRENT_USER_ID = 'hezhong233';
const MOCK_CURRENT_USER_USERNAME = 'hezhong233';

function isCurrentUserIn(list: string): boolean {
  if (!list) return false;
  const items = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.includes(MOCK_CURRENT_USER_ID) || items.includes(MOCK_CURRENT_USER_USERNAME);
}

export function middleware(request: NextRequest) {
  const session =
    request.cookies.get(USER_ACCESS_COOKIE) ??
    request.cookies.get(USER_REFRESH_COOKIE) ??
    (IS_MOCK ? request.cookies.get('forum_session') : undefined);
  const banned = request.cookies.get(BAN_COOKIE)?.value ?? '';
  const suspended = request.cookies.get(SUSPEND_COOKIE)?.value ?? '';
  const { pathname } = request.nextUrl;

  // 公开路由：无需登录也可访问
  const publicPaths = [
    '/login',
    '/register',
    '/forgot-password',
    '/banned',
    '/community-rules',
    '/terms',
    '/privacy',
    '/help',
    '/contact',
  ];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 已登录用户访问登录页 → 跳回首页
  // 注意：在真实后端模式下，如果 Token 失效但 Cookie 仍存在，强制重定向会阻止用户重新登录。
  // 因此仅在 MOCK 模式下才强制重定向已登录用户远离登录/注册页。
  if (IS_MOCK && session && isPublic && !pathname.startsWith('/banned')) {
    if (isCurrentUserIn(banned) || isCurrentUserIn(suspended)) {
      return NextResponse.redirect(new URL('/banned', request.url));
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // mock 模式下已登录但被封禁/禁言 → 强制跳 /banned
  if (IS_MOCK && session && !pathname.startsWith('/banned')) {
    if (isCurrentUserIn(banned)) {
      const url = new URL('/banned', request.url);
      url.searchParams.set('reason', 'banned');
      return NextResponse.redirect(url);
    }
    if (isCurrentUserIn(suspended)) {
      const url = new URL('/banned', request.url);
      url.searchParams.set('reason', 'suspended');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|static|healthz|readyz|favicon.ico|.*\\..*).*)'],
};
