'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, ArrowLeft, BookOpen, MessageSquare, PencilLine } from 'lucide-react';
import { COURSE_GUIDE_COURSES, COURSE_GUIDE_REVIEWS } from '@/data/compass';
import { relativeTime } from '@/lib/format';

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = String(params.courseId);
  const course = COURSE_GUIDE_COURSES.find((c) => c.id === courseId);
  const reviews = COURSE_GUIDE_REVIEWS[courseId] ?? [];

  if (!course) {
    return (
      <div className="space-y-4 text-center py-12">
        <p className="text-muted-foreground">课程不存在</p>
        <Button variant="outline" asChild>
          <Link href="/compass">返回课程列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2" asChild>
            <Link href="/compass">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{course.name}</h1>
            <p className="text-sm text-muted-foreground">课程评价单 · {course.category}</p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href={`/compass/submit?courseId=${courseId}`}>
            <PencilLine className="size-4" /> 写评价
          </Link>
        </Button>
      </header>
      <Separator />

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-primary" />
            课程基本信息
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 text-sm sm:grid-cols-2 sm:p-6 sm:pt-0">
          <InfoItem label="课程号" value={course.courseCode || '暂无'} />
          <InfoItem label="老师" value={course.teacher} />
          <InfoItem label="学分" value={course.credits ? `${course.credits} 学分` : '暂无'} />
          <InfoItem label="课程类型" value={course.category} />
          {course.courseModule && <InfoItem label="课程模块" value={course.courseModule} />}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>以下为历史评价，可能存在偏误或时效性问题，请结合自身情况明辨是非。</p>
      </div>

      <div className="flex items-center gap-2">
        <MessageSquare className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">
          历史评价
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({reviews.length} 条)
          </span>
        </h2>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <MessageSquare className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">暂无历史评价</p>
          <Button className="mt-3" size="sm" asChild>
            <Link href={`/compass/submit?courseId=${courseId}`}>写评价</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <Card key={review.id} className="shadow-card">
              <CardContent className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {review.semester}
                  </span>
                  {review.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm leading-relaxed">{review.content}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {review.author.type === 'anonymous'
                      ? review.author.pseudonym.displayName
                      : review.author.username}
                  </span>
                  <span>·</span>
                  <span>{relativeTime(review.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
