import Link from 'next/link';
import { ArrowLeft, MapPin, Star, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FoodProductCard } from '@/components/food-product-card';
import { FoodReviewForm } from '@/components/food-review-form';
import { FoodReviewList } from '@/components/food-review-list';
import { listFoodCanteens, listFoodReviews } from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FoodWindowPage({ params }: PageProps) {
  const { id } = await params;
  const [canteens, reviews] = await Promise.all([listFoodCanteens(), listFoodReviews(id)]);
  const window = canteens.flatMap((canteen) => canteen.windows).find((item) => item.id === id);

  if (!window) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="font-medium">窗口不存在</p>
        <Button asChild variant="link">
          <Link href="/food">返回美食首页</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <Link
        href={`/food/canteens/${window.canteen.slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 返回{window.canteen.name}
      </Link>
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-primary">
              <Utensils className="size-4" />
              窗口详情
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{window.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {window.canteen.name} · {window.floor} 楼
              {window.windowNumber ? ` · ${window.windowNumber}` : ''}
            </p>
            {window.locationDescription && (
              <p className="mt-1 text-sm text-muted-foreground">
                <MapPin className="mr-1 inline size-3.5" />
                {window.locationDescription}
              </p>
            )}
          </div>
          <Star className="size-8 text-amber-500" />
        </div>
      </section>
      {window.products && window.products.length > 0 && (
        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <div>
            <h2 className="text-xl font-bold tracking-tight">在售产品</h2>
            <p className="mt-1 text-sm text-muted-foreground">商家后台提交、平台审核通过后展示</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {window.products.map((product) => (
              <FoodProductCard key={product.id} product={product} window={window} />
            ))}
          </div>
        </section>
      )}
      <FoodReviewForm windowId={id} />
      <FoodReviewList windowId={id} initial={reviews} />
    </div>
  );
}
