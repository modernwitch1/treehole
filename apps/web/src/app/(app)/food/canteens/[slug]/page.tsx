import Link from 'next/link';
import { ArrowLeft, MapPin, Star, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getFoodCanteen } from '@/lib/api';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function FoodCanteenPage({ params }: PageProps) {
  const { slug } = await params;
  let canteen;
  try {
    canteen = await getFoodCanteen(slug);
  } catch {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6 pb-8">
      <Link
        href="/food"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 返回美食首页
      </Link>
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-primary">
              <MapPin className="size-4" /> 食堂
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{canteen.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{canteen.description}</p>
          </div>
          <Store className="size-8 text-primary/70" />
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {canteen.windows.map((window) => (
          <Card key={window.id}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{window.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {window.floor} 楼{window.windowNumber ? ` · ${window.windowNumber}` : ''}
                  </p>
                </div>
                <Badge variant="secondary">
                  <Star className="mr-1 size-3" />
                  口味评价
                </Badge>
              </div>
              {window.merchant && (
                <p className="text-sm text-muted-foreground">商家：{window.merchant.name}</p>
              )}
              {window.locationDescription && (
                <p className="text-sm text-muted-foreground">{window.locationDescription}</p>
              )}
              {window.products && window.products.length > 0 && (
                <div className="rounded-xl bg-orange-50/70 p-3">
                  <p className="text-xs font-semibold text-orange-800">在售产品</p>
                  <div className="mt-2 space-y-2">
                    {window.products.slice(0, 3).map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate">{product.name}</span>
                        {product.priceCents !== null && product.priceCents !== undefined && (
                          <span className="shrink-0 font-medium text-orange-700">
                            ¥{(product.priceCents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {window.products.length > 3 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      还有 {window.products.length - 3} 个产品，进入窗口查看全部
                    </p>
                  )}
                </div>
              )}
              <Button asChild variant="outline" className="w-full rounded-xl">
                <Link href={`/food/windows/${window.id}`}>查看评价</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="font-medium">食堂不存在</p>
      <Button asChild variant="link">
        <Link href="/food">返回美食首页</Link>
      </Button>
    </div>
  );
}
