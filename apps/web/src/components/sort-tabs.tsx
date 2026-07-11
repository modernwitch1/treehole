'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Flame, Sparkles, TrendingUp } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SortType } from '@/types/api';

interface SortTabsProps {
  defaultValue?: SortType;
}

export function SortTabs({ defaultValue = 'hot' }: SortTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get('sort') as SortType) ?? defaultValue;

  function handleChange(value: string) {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (value === 'hot') params.delete('sort');
    else params.set('sort', value);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '?');
  }

  return (
    <Tabs value={current} onValueChange={handleChange}>
      <TabsList>
        <TabsTrigger value="hot">
          <Flame className="size-3.5" />
          热门
        </TabsTrigger>
        <TabsTrigger value="new">
          <Sparkles className="size-3.5" />
          最新
        </TabsTrigger>
        <TabsTrigger value="top">
          <TrendingUp className="size-3.5" />
          历史最佳
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
