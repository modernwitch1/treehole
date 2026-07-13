import Link from 'next/link';
import RulesPage from '@/app/(app)/rules/page';

export const metadata = { title: '社区规则' };

export default function PublicCommunityRulesPage() {
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
      <RulesPage />
    </div>
  );
}
