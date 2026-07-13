import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ImageOff, MapPin, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FoodProduct, FoodWindow } from '@/types/api';

export function FoodProductCard({
  product,
  window,
  compact = false,
}: {
  product: FoodProduct;
  window: FoodWindow;
  compact?: boolean;
}) {
  const price =
    product.priceCents === null || product.priceCents === undefined
      ? '到店询价'
      : `¥${(product.priceCents / 100).toFixed(2)}`;

  return (
    <article
      className={`group overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${compact ? 'flex gap-3 p-3' : ''}`}
    >
      <div
        className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-orange-100 via-amber-50 to-rose-100 ${compact ? 'size-24 rounded-xl' : 'aspect-[1.15/1]'}`}
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes={compact ? '96px' : '(max-width: 640px) 50vw, 260px'}
            unoptimized
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-orange-700/70">
            <ImageOff className={compact ? 'size-5' : 'size-8'} />
            {!compact && <span className="text-xs font-medium">暂无商品图片</span>}
          </div>
        )}
        {product.category && (
          <Badge className="absolute left-2 top-2 rounded-full bg-white/90 text-orange-800 shadow-sm hover:bg-white">
            {product.category}
          </Badge>
        )}
      </div>

      <div className={`min-w-0 flex-1 ${compact ? 'py-0.5' : 'p-4'}`}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 font-semibold tracking-tight">{product.name}</h3>
          <span className="shrink-0 text-base font-bold text-primary">{price}</span>
        </div>
        {product.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {product.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Store className="size-3.5" /> {window.merchant?.name ?? '校园窗口'}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {window.canteen.name} · {window.name}
          </span>
        </div>
        {!compact && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mt-3 -ml-2 rounded-full text-primary"
          >
            <Link href={`/food/windows/${window.id}`}>
              查看窗口和评价 <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
