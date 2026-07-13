'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, Store, Utensils } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FoodProductCard } from '@/components/food-product-card';
import type { FoodCanteen, FoodProduct, FoodWindow } from '@/types/api';

type CatalogItem = {
  product: FoodProduct;
  window: FoodWindow;
};

export function FoodMarketplace({ canteens }: { canteens: FoodCanteen[] }) {
  const [canteenSlug, setCanteenSlug] = React.useState('all');
  const [windowId, setWindowId] = React.useState('all');
  const [category, setCategory] = React.useState('全部');
  const [query, setQuery] = React.useState('');

  const catalog = React.useMemo<CatalogItem[]>(
    () =>
      canteens.flatMap((canteen) =>
        canteen.windows.flatMap((window) =>
          (window.products ?? []).map((product) => ({ product, window })),
        ),
      ),
    [canteens],
  );

  const categories = React.useMemo(
    () => ['全部', ...new Set(catalog.map(({ product }) => product.category || '其他'))],
    [catalog],
  );

  const availableWindows = React.useMemo(
    () =>
      canteens
        .filter((canteen) => canteenSlug === 'all' || canteen.slug === canteenSlug)
        .flatMap((canteen) => canteen.windows),
    [canteens, canteenSlug],
  );

  const filtered = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.filter(({ product, window }) => {
      const matchesCanteen = canteenSlug === 'all' || window.canteen.slug === canteenSlug;
      const matchesWindow = windowId === 'all' || window.id === windowId;
      const matchesCategory = category === '全部' || (product.category || '其他') === category;
      const searchText = [
        product.name,
        product.description,
        product.category,
        window.name,
        window.merchant?.name,
        window.canteen.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        matchesCanteen &&
        matchesWindow &&
        matchesCategory &&
        (!normalizedQuery || searchText.includes(normalizedQuery))
      );
    });
  }, [catalog, canteenSlug, category, query, windowId]);

  function selectCanteen(value: string) {
    setCanteenSlug(value);
    setWindowId('all');
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.5rem] border border-orange-200/70 bg-gradient-to-br from-orange-50 via-card to-amber-50 p-6 shadow-card sm:p-8">
        <div className="absolute -right-12 -top-16 size-52 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative max-w-3xl space-y-4">
          <Badge variant="secondary" className="rounded-full bg-white/75 text-orange-700">
            <Utensils className="mr-1 size-3.5" /> 校园美食菜单
          </Badge>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">今天吃什么？</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              像逛外卖菜单一样浏览行云苑、流水苑二楼窗口的在售商品。这里展示菜单和评价，不提供线上点单与支付。
            </p>
          </div>
          <label className="flex h-12 items-center gap-3 rounded-2xl border bg-white/90 px-4 shadow-sm">
            <Search className="size-5 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索商品、商家或窗口"
              aria-label="搜索美食商品"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                清除
              </button>
            )}
          </label>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-3 py-2 text-sm text-muted-foreground">
          <SlidersHorizontal className="size-3.5" /> 筛选
        </span>
        {canteens.map((canteen) => (
          <button
            key={canteen.id}
            type="button"
            onClick={() => selectCanteen(canteen.slug)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${canteenSlug === canteen.slug ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {canteen.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => selectCanteen('all')}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${canteenSlug === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          全部
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden space-y-5 lg:block">
          <FilterGroup title="选择食堂">
            <FilterButton active={canteenSlug === 'all'} onClick={() => selectCanteen('all')}>
              全部食堂
            </FilterButton>
            {canteens.map((canteen) => (
              <FilterButton
                key={canteen.id}
                active={canteenSlug === canteen.slug}
                onClick={() => selectCanteen(canteen.slug)}
              >
                {canteen.name}
              </FilterButton>
            ))}
          </FilterGroup>
          <FilterGroup title="商品分类">
            {categories.map((item) => (
              <FilterButton key={item} active={category === item} onClick={() => setCategory(item)}>
                {item}
              </FilterButton>
            ))}
          </FilterGroup>
          <FilterGroup title="窗口">
            <FilterButton active={windowId === 'all'} onClick={() => setWindowId('all')}>
              全部窗口
            </FilterButton>
            {availableWindows.map((window) => (
              <FilterButton
                key={window.id}
                active={windowId === window.id}
                onClick={() => setWindowId(window.id)}
              >
                {window.name}
              </FilterButton>
            ))}
          </FilterGroup>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Menu / 商品菜单
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                {canteenSlug === 'all'
                  ? '全部商品'
                  : (canteens.find((item) => item.slug === canteenSlug)?.name ?? '商品菜单')}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">找到 {filtered.length} 个商品</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${category === item ? 'bg-orange-100 font-semibold text-orange-800' : 'bg-muted text-muted-foreground'}`}
              >
                {item}
              </button>
            ))}
          </div>

          {filtered.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(({ product, window }) => (
                <FoodProductCard key={product.id} product={product} window={window} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed py-16 text-center">
              <Store className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 font-medium">暂时没有匹配的商品</p>
              <p className="mt-1 text-sm text-muted-foreground">可以换个关键词或筛选条件试试。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}
