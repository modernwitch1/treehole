import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_SC } from 'next/font/google';
import { Providers } from '@/components/providers';
import { COLOR_THEME_STORAGE_KEY } from '@/lib/color-theme';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSansSc = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: '浙工商树洞 — 浙江工商大学校园社区',
    template: '%s · 浙工商树洞',
  },
  description: '浙江工商大学学生专属社区。@pop.zjgsu.edu.cn 校园邮箱验证注册。',
  applicationName: '浙工商树洞',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#101917' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const colorThemeBootstrapScript = `
(function () {
  try {
    var palette = window.localStorage.getItem('${COLOR_THEME_STORAGE_KEY}');
    if (palette === 'pink' || palette === 'green' || palette === 'blue' || palette === 'beige') {
      document.documentElement.dataset.palette = palette;
    }
  } catch (_) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${inter.variable} ${notoSansSc.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorThemeBootstrapScript }} />
      </head>
      <body
        className="min-h-screen overflow-x-hidden bg-background font-sans antialiased"
        style={{
          fontFamily:
            'var(--font-inter), var(--font-noto-sc), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
