'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { COURSE_GUIDE_COURSES } from '@/data/compass';
import { createPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CommunitySafetyNotice } from '@/components/community-safety-notice';

export const dynamic = 'force-dynamic';

const ALL_TAGS = [
  '课程有趣',
  '老师讲得好',
  '给分高',
  '内容实用',
  '作业不多',
  '考试简单',
  '需要刷题',
  '要求严格',
];
const SEMESTERS = ['2026春季', '2025秋季', '2025春季', '2024秋季', '2024春季'];

export default function SubmitReviewPage() {
  return (
    <React.Suspense
      fallback={<div className="py-12 text-center text-muted-foreground">加载中…</div>}
    >
      <SubmitReviewForm />
    </React.Suspense>
  );
}

function SubmitReviewForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId') ?? '';

  const course = COURSE_GUIDE_COURSES.find((c) => c.id === courseId);

  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [content, setContent] = React.useState('');
  const [semester, setSemester] = React.useState('2025秋季');
  const [submitting, setSubmitting] = React.useState(false);
  const [publishedPostId, setPublishedPostId] = React.useState<string>();
  const [rulesAcknowledged, setRulesAcknowledged] = React.useState(false);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!course || !content.trim()) return;
    setSubmitting(true);
    try {
      const tagLine = selectedTags.length > 0 ? selectedTags.map((tag) => `#${tag}`).join(' ') : '暂无';
      const courseInfo = [course.courseCode, course.teacher, course.department]
        .filter(Boolean)
        .join(' · ');
      const post = await createPost({
        title: `【课程评价】${course.name} · ${course.teacher}`,
        contentMd: [
          `> ${courseInfo}`,
          '',
          `**上课学期：** ${semester}`,
          `**体验标签：** ${tagLine}`,
          '',
          content.trim(),
          '',
          '— 来自「选课指南针」匿名课程评价',
        ].join('\n'),
        boardSlug: 'course',
        isAnonymous: true,
        rulesAcknowledged,
      });
      if (post.status === 'pending_review') {
        toast.success('评价已提交审核，审核通过后公开');
        router.push('/compass');
      } else {
        setPublishedPostId(post.id);
        toast.success('课程评价已发布');
      }
    } catch (error) {
      toast.error((error as Error).message || '评价发布失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (publishedPostId) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="size-6 text-green-500" />
            </div>
            <CardTitle>评价提交成功!</CardTitle>
            <CardDescription>
              感谢你的分享。评价已作为匿名经验帖发布到「选课交流」，其他同学现在就能看到并讨论。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <Button asChild>
              <Link href={`/p/${publishedPostId}`}>查看已发布评价</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/compass">返回课程列表</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href={courseId ? `/compass/${courseId}` : '/compass'}>
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">评价课程</h1>
      </header>
      <Separator />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 选课程 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">选择课程</CardTitle>
            <CardDescription>{course ? '已选择课程' : '搜索并选择你要评价的课程'}</CardDescription>
          </CardHeader>
          <CardContent>
            {course ? (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1">
                  <p className="font-medium">{course.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {course.teacher} · {course.department}
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/compass">更换</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                请从{' '}
                <Link href="/compass" className="text-primary underline">
                  课程列表
                </Link>{' '}
                中选择课程
              </p>
            )}
          </CardContent>
        </Card>

        <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          提交后会以匿名经验帖发布到「选课交流」板块，评价可被回复、点赞和举报；请避免填写可识别个人身份的信息。
        </p>

        {/* 标签 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">课程标签</CardTitle>
            <CardDescription>选择符合的标签（多选）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                    selectedTags.includes(tag)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 文字评价 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">文字评价</CardTitle>
            <CardDescription>详细说说你的上课体验</CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="说说老师的讲课风格、作业量、考试难度、给分情况……"
              rows={6}
              maxLength={500}
              required
              className="block w-full resize-y rounded-lg border border-input bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {content.length} / 500
            </p>
          </CardContent>
        </Card>

        {/* 学期 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">上课学期</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <CommunitySafetyNotice compact />
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            checked={rulesAcknowledged}
            onChange={(event) => setRulesAcknowledged(event.target.checked)}
            className="mt-0.5"
          />
          <span>我确认评价基于真实体验，不造谣攻击、不泄露个人隐私，并遵守社区规则。</span>
        </label>

        <Separator />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button
            type="submit"
            disabled={submitting || !course || !content.trim() || !rulesAcknowledged}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {submitting ? '提交中…' : '提交评价'}
          </Button>
        </div>
      </form>
    </div>
  );
}
