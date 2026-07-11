import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { PostAuthor } from '@/types/api';

interface AuthorChipProps {
  author: PostAuthor;
  size?: 'sm' | 'md';
  className?: string;
}

/** 渲染作者头像 + 名字; 匿名用 emoji + 派生色背景, 楼主显示"楼主" tag。 */
export function AuthorChip({ author, size = 'sm', className }: AuthorChipProps) {
  const sizes = {
    sm: { avatar: 'size-5', text: 'text-xs' },
    md: { avatar: 'size-6', text: 'text-sm' },
  }[size];

  if (author.type === 'anonymous') {
    const { displayName, color, isOp } = author.pseudonym;
    return (
      <span className={cn('inline-flex items-center gap-1.5', sizes.text, className)}>
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
            sizes.avatar,
          )}
          style={{ background: color }}
          aria-hidden
        >
          匿
        </span>
        <span className="font-medium text-foreground">{displayName}</span>
        {isOp && (
          <span className="rounded-sm bg-primary/15 px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-primary">
            楼主
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', sizes.text, className)}>
      <Avatar className={cn(sizes.avatar)}>
        <AvatarImage src={author.user.avatarUrl} alt={author.user.username} />
        <AvatarFallback className="text-[10px]">{author.user.username[0]}</AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">{author.user.username}</span>
    </span>
  );
}
