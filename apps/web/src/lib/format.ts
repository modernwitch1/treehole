import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { formatCompact } from './utils';

/** 把 ISO 时间转成相对时间, 如 "3 小时前" */
export function relativeTime(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: zhCN });
}

/** Reddit 风格的分数: 1234 → 1.2k, 1234567 → 1.2M */
export { formatCompact as formatScore };
