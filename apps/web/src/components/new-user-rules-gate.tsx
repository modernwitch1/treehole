'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const acknowledgedRef = React.useRef(!safety.shouldPrompt);

  async function acknowledge() {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    try {
      await acknowledgeCommunityRules(safety.policyVersion, 'new_user_daily');
      acknowledgedRef.current = true;
      setOpen(false);
      router.refresh();
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
          <DialogTitle className="text-center">
            新用户第 {safety.accountAgeDays + 1} 天社区规则确认
          </DialogTitle>
          <DialogDescription className="text-center">
            新注册账号前 7 天，每天首次进入时需要确认；确认前不能继续使用社区服务
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
            对规则判断有异议时可以申诉；正常批评、求助以及医学和教育语境不会仅因包含某个词语而自动处罚。请打开
            <Link
              href="/community-rules"
              target="_blank"
              rel="noreferrer"
              className="mx-1 font-medium text-foreground underline underline-offset-4"
            >
              完整社区规则
            </Link>
            了解责任边界、举报和申诉流程。
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
            我已阅读并同意遵守
            <Link
              href="/community-rules"
              target="_blank"
              rel="noreferrer"
              className="mx-1 font-medium underline underline-offset-4"
            >
              社区规则
            </Link>
            ，理解发布者应对自己的内容负责，违规内容可能被拦截、隐藏并受到账号处罚。
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
