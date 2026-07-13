import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, CalendarDays, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getFoodPost } from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FoodPostPage({ params }: PageProps) {
  const { id } = await params;
  let post;
  try {
    post = await getFoodPost(id);
  } catch {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">美食内容不存在或已下架</p>
    );
  }

  return (
    <article className="space-y-5 pb-8">
      <Link
        href="/food"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 返回美食首页
      </Link>
      <div className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{typeLabel(post.type)}</Badge>
          <span className="inline-flex items-center gap-1">
            <Store className="size-3.5" />
            {post.merchant.name}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {new Date(post.createdAt).toLocaleDateString('zh-CN')}
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{post.title}</h1>
        {post.coverUrl && (
          <div className="relative mt-6 min-h-64 overflow-hidden rounded-xl">
            <Image
              src={post.coverUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              unoptimized
              className="object-cover"
            />
          </div>
        )}
        <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-foreground/85">
          {post.contentMd}
        </div>
      </div>
    </article>
  );
}

function typeLabel(type: string) {
  return (
    { new_product: '新品', promotion: '促销', advertisement: '广告', notice: '公告' }[type] ??
    '美食动态'
  );
}
