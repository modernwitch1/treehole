'use client';

import Link from 'next/link';

export default function WebError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-card">
        <p className="text-sm font-semibold text-destructive">页面暂时无法加载</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight">请稍后重试</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          网络或服务暂时出现波动，页面内容没有成功加载。你的账号和已发布内容不会因此丢失。
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">错误编号：{error.digest}</p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            重新加载
          </button>
          <Link
            href="/login"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            返回登录
          </Link>
        </div>
      </div>
    </main>
  );
}
