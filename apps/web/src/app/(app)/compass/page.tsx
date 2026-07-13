import Link from 'next/link';
import { BookOpen, ChevronLeft, ChevronRight, MessageSquare, Search, Trophy } from 'lucide-react';
import { COURSE_GUIDE_COURSES } from '@/data/compass';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Course } from '@/types/api';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;
const DEPARTMENTS = [
  '全部',
  ...Array.from(new Set(COURSE_GUIDE_COURSES.map((course) => course.category))),
];
const SORT_OPTIONS = [
  { value: 'reviews', label: '历史评价最多' },
  { value: 'name', label: '课程名称' },
] as const;

type CompassParams = {
  q?: string;
  c?: string;
  s?: string;
  page?: string;
};

export default async function CompassPage({
  searchParams,
}: {
  searchParams: Promise<CompassParams>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 80);
  const category = DEPARTMENTS.includes(params.c ?? '') ? (params.c as string) : '全部';
  const sortBy = params.s === 'name' ? 'name' : 'reviews';
  const requestedPage = Number.parseInt(params.page ?? '1', 10);

  const normalizedQuery = query.toLocaleLowerCase('zh-CN');
  const filteredCourses = COURSE_GUIDE_COURSES.filter((course) => {
    if (category !== '全部' && course.category !== category) return false;
    if (!normalizedQuery) return true;
    return [course.name, course.teacher, course.courseCode, course.department]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
  }).sort((a, b) => {
    if (sortBy === 'reviews') {
      return b.reviewCount - a.reviewCount || a.name.localeCompare(b.name, 'zh-CN');
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const visibleCourses = filteredCourses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const currentParams = { q: query, c: category, s: sortBy, page: String(page) };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Trophy className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">选课指南针</h1>
            <p className="text-sm text-muted-foreground">查课程评价 · 看历史经验 · 帮同学避坑</p>
          </div>
        </div>
      </header>
      <Separator />

      <form
        action="/compass"
        className="grid gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:grid-cols-[1fr_auto_auto] sm:p-4"
        role="search"
      >
        <label className="relative min-w-0">
          <span className="sr-only">搜索课程、教师或课程号</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={80}
            placeholder="搜索课程、老师、课程号…"
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </label>
        <label>
          <span className="sr-only">排序方式</span>
          <select
            name="s"
            defaultValue={sortBy}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-auto"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {category !== '全部' && <input type="hidden" name="c" value={category} />}
        <Button type="submit" className="rounded-xl">
          <Search className="size-4" /> 查询
        </Button>
      </form>

      <section aria-labelledby="course-categories" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="course-categories" className="text-sm font-semibold">
            课程分类
          </h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            找到 {filteredCourses.length} 门课程
          </p>
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
          aria-label="课程分类"
        >
          {DEPARTMENTS.map((department) => {
            const active = category === department;
            return (
              <Link
                key={department}
                href={buildCompassHref(currentParams, { c: department, page: '1' })}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm'
                    : 'shrink-0 rounded-full bg-muted px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
                }
              >
                {department}
              </Link>
            );
          })}
        </div>
      </section>

      {visibleCourses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center text-sm text-muted-foreground">
          <BookOpen className="mx-auto size-10 opacity-40" />
          <p className="mt-3 font-medium text-foreground">没有找到匹配的课程</p>
          <p className="mt-1">试试课程简称、老师姓名，或清除筛选条件</p>
          <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
            <Link href="/compass">查看全部课程</Link>
          </Button>
        </div>
      ) : (
        <section aria-label="课程搜索结果" className="grid gap-3 sm:grid-cols-2">
          {visibleCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </section>
      )}

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between border-t border-border/70 pt-5"
          aria-label="课程分页"
        >
          <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
            {page > 1 ? (
              <Link href={buildCompassHref(currentParams, { page: String(page - 1) })}>
                <ChevronLeft className="size-4" /> 上一页
              </Link>
            ) : (
              <span>
                <ChevronLeft className="size-4" /> 上一页
              </span>
            )}
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <Button
            asChild={page < totalPages}
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
          >
            {page < totalPages ? (
              <Link href={buildCompassHref(currentParams, { page: String(page + 1) })}>
                下一页 <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span>
                下一页 <ChevronRight className="size-4" />
              </span>
            )}
          </Button>
        </nav>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/compass/${course.id}`}
      prefetch={false}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <BookOpen className="size-4 shrink-0 text-primary" />
                <h3 className="truncate text-base font-semibold transition-colors group-hover:text-primary">
                  {course.name}
                </h3>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {course.teacher} · {course.category}
                {course.credits ? ` · ${course.credits} 学分` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {[course.courseModule, ...course.topTags]
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[11px]">
                      {tag}
                    </Badge>
                  ))}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-1 text-primary">
                <MessageSquare className="size-4" />
                <span className="text-lg font-bold tabular-nums">{course.reviewCount}</span>
              </div>
              <p className="text-xs text-muted-foreground">历史评价</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function buildCompassHref(current: CompassParams, overrides: CompassParams): string {
  const values = { ...current, ...overrides };
  const query = new URLSearchParams();
  if (values.q) query.set('q', values.q);
  if (values.c && values.c !== '全部') query.set('c', values.c);
  if (values.s && values.s !== 'reviews') query.set('s', values.s);
  if (values.page && values.page !== '1') query.set('page', values.page);
  const suffix = query.toString();
  return suffix ? `/compass?${suffix}` : '/compass';
}
