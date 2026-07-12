'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { applyForBoard } from '@/lib/api';
import { toast } from 'sonner';
import { CommunitySafetyNotice } from '@/components/community-safety-notice';

export default function ApplyBoardPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [rulesAcknowledged, setRulesAcknowledged] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('请填写板块名称');
      return;
    }
    if (name.length > 50) {
      toast.error('板块名称最多 50 字');
      return;
    }
    if (!description.trim()) {
      toast.error('请填写板块简介');
      return;
    }
    if (description.length > 200) {
      toast.error('板块简介最多 200 字');
      return;
    }
    if (!reason.trim()) {
      toast.error('请填写申请理由');
      return;
    }
    if (!rulesAcknowledged) {
      toast.error('请先确认申请内容遵守社区规则');
      return;
    }

    setSubmitting(true);
    try {
      await applyForBoard({
        name: name.trim(),
        description: description.trim(),
        reason: reason.trim(),
        rulesAcknowledged,
      });
      toast.success('申请已提交，请等待管理员审核');
      router.push('/');
    } catch (err) {
      toast.error((err as Error).message || '申请失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          返回首页
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="size-6" />
            申请开吧
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            申请创建一个新的讨论板块，管理员审核通过后即可使用
          </p>
        </div>
      </header>
      <Separator />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">板块名称 *</CardTitle>
            <CardDescription>给你的板块起一个简洁明了的名字</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：考研交流、摄影分享、音乐推荐..."
              maxLength={50}
              required
              className="block w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {name.length} / 50
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">板块简介 *</CardTitle>
            <CardDescription>简单描述这个板块的用途和适合讨论的内容</CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这个板块是用来做什么的？适合讨论哪些内容？"
              rows={3}
              maxLength={200}
              required
              className="block w-full resize-y rounded-lg border border-input bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {description.length} / 200
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">申请理由 *</CardTitle>
            <CardDescription>为什么需要这个板块？预计会吸引多少用户？</CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请详细说明申请理由，包括：&#10;1. 为什么现有板块不能满足需求？&#10;2. 预计会有多少用户参与？&#10;3. 板块的长期运营计划？"
              rows={6}
              required
              className="block w-full resize-y rounded-lg border border-input bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">审核说明</p>
              <ul className="list-inside list-disc space-y-1">
                <li>管理员会在 1-3 个工作日内审核你的申请</li>
                <li>审核结果会通过站内通知告知</li>
                <li>如果申请被拒，可以修改后重新提交</li>
                <li>每个用户同时只能有一个待审批的申请</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <CommunitySafetyNotice />

        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={rulesAcknowledged}
            onChange={(event) => setRulesAcknowledged(event.target.checked)}
            className="mt-1"
          />
          <span>我确认板块名称、简介和申请理由均遵守社区规则，不利用申请入口发布违规或引流信息。</span>
        </label>

        <Separator />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button type="submit" disabled={submitting || !rulesAcknowledged}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {submitting ? '提交中…' : '提交申请'}
          </Button>
        </div>
      </form>
    </div>
  );
}
