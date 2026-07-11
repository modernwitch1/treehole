'use client';

import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { setDmAllowed } from '@/lib/api';
import { toast } from 'sonner';

interface DmToggleProps {
  initial: boolean;
}

export function DmToggle({ initial }: DmToggleProps) {
  const [checked, setChecked] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function onChange(next: boolean) {
    setChecked(next);
    setSaving(true);
    try {
      const res = await setDmAllowed(next);
      if (!res.ok) {
        setChecked(!next); // rollback
        toast.error('保存失败,请重试');
        return;
      }
      toast.success(next ? '已开启陌生人私信' : '已关闭陌生人私信', {
        description: next
          ? '其他用户现在可以向你发起新会话。'
          : '陌生人无法向你发起新会话,已存在的会话不受影响。',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <Label htmlFor="dm-allowed" className="cursor-pointer text-base">
          允许陌生人私信我
        </Label>
        <p className="text-sm text-muted-foreground">
          关闭后,他人无法从帖子的「私信」按钮向你发起新会话。已存在的会话不受影响。
        </p>
      </div>
      <Switch
        id="dm-allowed"
        checked={checked}
        onCheckedChange={onChange}
        disabled={saving}
        aria-label="允许陌生人私信我"
      />
    </div>
  );
}
