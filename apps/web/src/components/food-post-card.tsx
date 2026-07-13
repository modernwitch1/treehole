import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, CalendarDays, Store, Utensils } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { FoodPost } from '@/types/api';

const TYPE_LABELS: Record<FoodPost['type'], string> = {
  new_product: '新品',
  promotion: '促销',
  advertisement: '广告',
  notice: '公告',
};

export function FoodPostCard({ post }: { post: FoodPost }) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg">
      {post.coverUrl && (
        <div className="relative aspect-[2.4/1] overflow-hidden bg-muted">
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
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{TYPE_LABELS[post.type]}</Badge>
          <span className="inline-flex items-center gap-1">
            <Store className="size-3.5" /> {post.merchant.name}
          </span>
          {post.window && (
            <span className="inline-flex items-center gap-1">
              <Utensils className="size-3.5" /> {post.window.name}
            </span>
          )}
        </div>
        <Link href={`/food/posts/${post.id}`} className="group">
          <h2 className="text-lg font-semibold tracking-tight group-hover:text-primary">
            {post.title}
          </h2>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {post.contentMd}
        </p>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" /> {formatDate(post.createdAt)}
          </span>
          <Link
            href={`/food/posts/${post.id}`}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            查看详情 <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
    new Date(value),
  );
}
