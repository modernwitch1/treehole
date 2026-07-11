'use client';

import * as React from 'react';
import { BellRing, ExternalLink, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { listAnnouncements, publishAnnouncement } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { SystemAnnouncement } from '@/types/admin';

export default function SettingsPage() {
  const [announcements, setAnnouncements] = React.useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');

  const reload = React.useCallback(() => {
    setLoading(true);
    listAnnouncements({ pageSize: 200 })
      .then((res) => setAnnouncements(res.items))
      .catch((err) => toast.error((err as Error).message ?? '加载通知失败'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error('请填写通知标题和内容');
      return;
    }
    setSubmitting(true);
    try {
      const result = await publishAnnouncement({
        title: title.trim(),
        body: body.trim(),
        linkUrl: linkUrl.trim() || undefined,
      });
      setAnnouncements((items) => [result.announcement, ...items]);
      setTitle('');
      setBody('');
      setLinkUrl('');
      toast.success(`已发送给 ${result.announcement.recipientCount} 个用户`);
    } catch (err) {
      toast.error((err as Error).message ?? '发布失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">站点设置</h1>
        <p className="text-sm text-muted-foreground">发布站内通知 / 查看通知历史</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4" /> 发布首页通知
            </CardTitle>
            <CardDescription>
              通知会同步进入树洞首页顶部导航栏的铃铛通知，下发给所有活跃用户。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="announcement-title">标题</Label>
                <Input
                  id="announcement-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="例如：期末周树洞使用提醒"
                />
                <p className="text-right text-xs text-muted-foreground">{title.length} / 120</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-body">内容</Label>
                <textarea
                  id="announcement-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={1000}
                  rows={8}
                  placeholder="写给全体用户的通知内容"
                  className="block w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-right text-xs text-muted-foreground">{body.length} / 1000</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-link">跳转链接</Label>
                <Input
                  id="announcement-link"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="/rules 或 https://unidating.top/rules"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="animate-spin" /> : <Send />}
                发布通知
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">通知历史</CardTitle>
            <CardDescription>最近 50 条后台发布的全站通知。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
            ) : announcements.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">暂无通知</div>
            ) : (
              announcements.map((announcement) => (
                <article key={announcement.id} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-1 text-sm font-semibold">{announcement.title}</h2>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {announcement.body}
                      </p>
                    </div>
                    <Badge variant="muted" className="shrink-0">
                      {announcement.recipientCount} 人
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{relativeTime(announcement.createdAt)}</span>
                    <span>发布人: {announcement.publishedBy}</span>
                    {announcement.linkUrl && (
                      <a
                        href={announcement.linkUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-primary"
                      >
                        查看链接 <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
