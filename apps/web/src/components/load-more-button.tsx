'use client';

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface LoadMoreButtonProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  label?: string;
}

export function LoadMoreButton({
  hasMore,
  isLoading,
  onLoadMore,
  label = '加载更多',
}: LoadMoreButtonProps) {
  if (!hasMore) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        没有更多了
      </div>
    );
  }

  return (
    <div className="py-4 text-center">
      <Button
        variant="outline"
        onClick={onLoadMore}
        disabled={isLoading}
        className="min-w-[120px]"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中...
          </>
        ) : (
          label
        )}
      </Button>
    </div>
  );
}
