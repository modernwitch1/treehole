'use client';

import * as React from 'react';
import { COLOR_THEME_STORAGE_KEY, isColorTheme, type ColorTheme } from '@/lib/color-theme';

interface ColorThemeContextValue {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = React.createContext<ColorThemeContextValue | null>(null);

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorThemeState] = React.useState<ColorTheme>('green');

  React.useEffect(() => {
    let nextTheme: ColorTheme = 'green';
    try {
      const storedTheme = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
      if (isColorTheme(storedTheme)) nextTheme = storedTheme;
    } catch {
      // 浏览器禁用本地存储时仍然使用默认主题。
    }

    document.documentElement.dataset.palette = nextTheme;
    setColorThemeState(nextTheme);
  }, []);

  const setColorTheme = React.useCallback((nextTheme: ColorTheme) => {
    document.documentElement.dataset.palette = nextTheme;
    setColorThemeState(nextTheme);
    try {
      window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // 本地存储不可用时不阻断主题切换。
    }
  }, []);

  const value = React.useMemo(() => ({ colorTheme, setColorTheme }), [colorTheme, setColorTheme]);

  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme() {
  const context = React.useContext(ColorThemeContext);
  if (!context) throw new Error('useColorTheme must be used within ColorThemeProvider');
  return context;
}
