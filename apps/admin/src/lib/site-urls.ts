function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

function fallbackUrl(port: number) {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return `http://localhost:${port}`;
}

export const WEB_APP_URL = trimTrailingSlash(
  process.env.NEXT_PUBLIC_WEB_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? fallbackUrl(3001),
);

export const ADMIN_APP_URL = trimTrailingSlash(
  process.env.NEXT_PUBLIC_ADMIN_URL ?? fallbackUrl(3002),
);
