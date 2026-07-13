'use client';

export default function MerchantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-red-600">商家后台暂时无法加载</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">请重新加载后再试</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          如果问题持续存在，请记录错误编号并联系平台管理员。
        </p>
        {error.digest && <p className="mt-3 text-xs text-slate-400">错误编号：{error.digest}</p>}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          重新加载
        </button>
      </div>
    </main>
  );
}
