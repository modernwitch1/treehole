import { FoodPostCard } from '@/components/food-post-card';
import { FoodMarketplace } from '@/components/food-marketplace';
import { listFoodCanteens, listFoodFeed } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function FoodHomePage() {
  const [canteens, feed] = await Promise.all([listFoodCanteens(), listFoodFeed({ limit: 6 })]);

  return (
    <div className="space-y-8 pb-8">
      <FoodMarketplace canteens={canteens} />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">商家动态</h2>
            <p className="mt-1 text-sm text-muted-foreground">新品、促销和商家公告</p>
          </div>
        </div>
        {feed.items.length > 0 ? (
          <div className="space-y-4">
            {feed.items.map((post) => (
              <FoodPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed py-14 text-center text-sm text-muted-foreground">
            商家还没有发布动态，先去看看窗口评价吧。
          </div>
        )}
      </section>
    </div>
  );
}
