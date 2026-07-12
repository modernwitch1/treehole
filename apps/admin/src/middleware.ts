import { type NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE = 'admin_access_token';

export function middleware(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;

  // If no token, let the client-side layout handle the login form
  // (we don't redirect because the layout renders an inline login form)
  if (!token) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)'],
};
