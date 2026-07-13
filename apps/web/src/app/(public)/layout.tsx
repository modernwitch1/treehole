import Link from 'next/link';

export default function PublicDocumentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/80 bg-background/90">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 md:px-6">
          <Link href="/login" className="text-sm font-semibold hover:underline">
            浙工商树洞
          </Link>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
            返回登录
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl justify-center px-4 py-8 md:px-6">
        <div className="w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
