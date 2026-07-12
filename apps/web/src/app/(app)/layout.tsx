import { Header } from '@/components/layout/header';
import { AppContentShell } from '@/components/layout/app-content-shell';
import { getCurrentUser } from '@/lib/api';
import { redirect } from 'next/navigation';
import { NewUserRulesGate } from '@/components/new-user-rules-gate';

export const dynamic = 'force-dynamic';

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }
  if (user.accountStatus === 'suspended') {
    redirect('/banned?reason=suspended');
  }

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <Header currentUser={user} />
      <NewUserRulesGate safety={user.communitySafety} />
      <AppContentShell>{children}</AppContentShell>
    </div>
  );
}
