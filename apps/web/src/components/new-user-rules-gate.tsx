'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { COMMUNITY_RULES, TRACEABILITY_NOTICE } from '@/lib/community-safety';
import { acknowledgeCommunityRules } from '@/lib/api';
import { toast } from 'sonner';

export function NewUserRulesGate({
  safety,
}: {
  safety: {
    policyVersion: string;
    accountAgeDays: number;
    isNewUser: boolean;
    acknowledgedToday: boolean;
    shouldPrompt: boolean;
  };
}) {
  const [open, setOpen] = React.useState(safety.shouldPrompt);
  const [confirmed, setConfirmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const acknowledgedRef = React.useRef(!safety.shouldPrompt);

  async function acknowledge() {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    try {
      await acknowledgeCommunityRules(safety.policyVersion, 'new_user_daily');
      acknowledgedRef.current = true;
      setOpen(false);
      toast.success('感谢确认，请共同维护友善、安全的校园社区');
    } catch (error) {
      toast.error((error as Error).message || '确认失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (!safety.isNewUser) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || acknowledgedRef.current) setOpen(next);
      }}
    >
      <DialogContent
        hideCloseButton
        className="sm:max-w-lg"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <DialogTitle className="text-center">新用户第 {safety.accountAgeDays + 1} 天安全提示</DialogTitle>
          <DialogDescription className="text-center">
            新用户前 7 天每天首次进入时需要确认社区准则
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
          <ul className="list-disc space-y-1.5 pl-5">
            {COMMUNITY_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{TRACEABILITY_NOTICE}</p>
          <p className="text-xs text-muted-foreground">
            对规则判断有异议时可以申诉；正常批评、求助以及医学和教育语境不会仅因包含某个词语而自动处罚。
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            我已阅读并愿意遵守
            <Link href="/rules" className="mx-1 font-medium underline underline-offset-4">
              社区规则
            </Link>
            ，理解违规内容可能被拦截、隐藏并受到账号处罚。
          </span>
        </label>

        <DialogFooter>
          <Button className="w-full" disabled={!confirmed || submitting} onClick={acknowledge}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            我已知晓并遵守
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
