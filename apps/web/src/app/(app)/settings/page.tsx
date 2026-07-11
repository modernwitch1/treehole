import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DmToggle } from '@/components/dm-toggle';
import { getCurrentUser } from '@/lib/api';

export const metadata = { title: '设置' };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-sm text-muted-foreground">管理你的私信、通知与账号</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">私信</CardTitle>
          <CardDescription>
            浙工商树洞内所有帖子和评论都是匿名发布,只有通过私信才能与人建立 1 对 1 联系。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DmToggle initial={user.dmAllowed} />

          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">规则速览</p>
            <ul className="mt-2 space-y-1 leading-relaxed">
              <li>• 对方未回前,发起方只能发送 1 条消息</li>
              <li>• 对方回复后,双方可以自由对话</li>
              <li>• 双方都用临时昵称,不会泄露你在论坛的真实身份</li>
              <li>• 任意时刻都可以拉黑或举报</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">账号</CardTitle>
          <CardDescription>校园邮箱 — 不公开显示,仅自己可见</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">邮箱</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">注册时间</span>
            <span>{new Date(user.createdAt).toLocaleDateString('zh-CN')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">邮箱验证</span>
            <span className="font-medium text-[color:var(--upvote)]">已验证</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">通知</CardTitle>
          <CardDescription>邮件 / 站内提醒粒度设置 — 即将上线</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
