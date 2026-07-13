export const COLOR_THEME_STORAGE_KEY = 'zjgsu-color-theme';

export const COLOR_THEMES = [
  {
    id: 'pink',
    label: '樱粉',
    description: '柔和、轻盈',
    swatch: '#b95375',
  },
  {
    id: 'green',
    label: '墨绿',
    description: '清爽、耐看',
    swatch: '#176b61',
  },
  {
    id: 'blue',
    label: '海蓝',
    description: '安静、理性',
    swatch: '#356ea8',
  },
  {
    id: 'beige',
    label: '米白',
    description: '温暖、松弛',
    swatch: '#9b6b48',
  },
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number]['id'];

export function isColorTheme(value: string | null): value is ColorTheme {
  return COLOR_THEMES.some((theme) => theme.id === value);
}
