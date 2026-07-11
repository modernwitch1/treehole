'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserRole, UserStatus } from '@/types/admin';

export function UsersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get('q') ?? '');

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (value && value !== 'all') params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '?');
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParam('q', q);
  }

  const status = (searchParams.get('status') as UserStatus) ?? 'all';
  const role = (searchParams.get('role') as UserRole) ?? 'all';
  const hasFilters =
    !!searchParams.get('q') || !!searchParams.get('status') || !!searchParams.get('role');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={onSearch} className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索用户名 / 邮箱"
          className="pl-8"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>

      <Select value={status} onValueChange={(v) => updateParam('status', v)}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="active">正常</SelectItem>
          <SelectItem value="suspended">禁言中</SelectItem>
          <SelectItem value="banned">已封禁</SelectItem>
        </SelectContent>
      </Select>

      <Select value={role} onValueChange={(v) => updateParam('role', v)}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="角色" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部角色</SelectItem>
          <SelectItem value="user">普通用户</SelectItem>
          <SelectItem value="moderator">版主</SelectItem>
          <SelectItem value="admin">管理员</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ('');
            router.push('?');
          }}
        >
          <X className="size-3.5" /> 清除筛选
        </Button>
      )}
    </div>
  );
}
