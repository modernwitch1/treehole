import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { COMMUNITY_RULES, TRACEABILITY_NOTICE } from '@/lib/community-safety';
import { cn } from '@/lib/utils';

export function CommunitySafetyNotice({
  compact = false,
  privateChannel = false,
  className,
}: {
  compact?: boolean;
  privateChannel?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs leading-relaxed',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">
            平台严肃处理违反社区规则的内容{privateChannel ? '，私信也不是规则之外的空间' : ''}
          </p>
          {compact ? (
            <p className="text-muted-foreground">
              禁止违法低俗、诈骗广告、攻击造谣和隐私泄露。{TRACEABILITY_NOTICE}
            </p>
          ) : (
            <>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {COMMUNITY_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">{TRACEABILITY_NOTICE}</p>
            </>
          )}
          <Link href="/rules" className="inline-flex font-medium text-foreground underline-offset-4 hover:underline">
            查看完整社区规则、处罚与申诉说明
          </Link>
        </div>
      </div>
    </div>
  );
}
