'use client';

import { Check, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { COLOR_THEMES } from '@/lib/color-theme';
import { useColorTheme } from '@/components/color-theme-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  const selectedTheme = COLOR_THEMES.find((theme) => theme.id === colorTheme) ?? COLOR_THEMES[1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="显示模式和配色"
        >
          <Sun className="h-[1.1rem] w-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.1rem] w-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span
            className="absolute bottom-1.5 right-1.5 size-1.5 rounded-full border border-background"
            style={{ backgroundColor: selectedTheme.swatch }}
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 [&_svg]:stroke-[1.8]">
        <DropdownMenuLabel>显示模式</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme('light')}>浅色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>深色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>跟随系统</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>界面配色</DropdownMenuLabel>
        {COLOR_THEMES.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => setColorTheme(theme.id)}
            className="gap-2.5"
          >
            <span
              className="size-4 shrink-0 rounded-full border border-black/10 shadow-inner dark:border-white/20"
              style={{ backgroundColor: theme.swatch }}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{theme.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                {theme.description}
              </span>
            </span>
            {colorTheme === theme.id && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
