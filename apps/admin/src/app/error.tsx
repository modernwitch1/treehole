'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-destructive">后台页面加载失败</p>
        <h1 className="mt-2 text-xl font-bold">请重新加载后再试</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          如果问题持续存在，请记录错误编号并联系系统维护人员。
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">错误编号：{error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          重新加载
        </button>
      </div>
    </main>
  );
}
