import { ShieldCheck, Sparkles, MessageSquareHeart, Compass } from 'lucide-react';

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: '校园邮箱认证',
    desc: '仅限 @pop.zjgsu.edu.cn 学生，告别外部人员骚扰',
  },
  {
    icon: MessageSquareHeart,
    title: '匿名树洞畅聊',
    desc: '同帖昵称稳定、跨帖独立，真正放心发声',
  },
  {
    icon: Compass,
    title: '选课指南针',
    desc: '学长学姐真实课程评价，避开雷课少走弯路',
  },
  {
    icon: Sparkles,
    title: '在线聊天房',
    desc: '房间开放 2 小时，常规记录默认留存 180 天',
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-stretch">
        <div className="relative hidden w-[52%] shrink-0 overflow-hidden bg-gradient-to-br from-primary via-orange-600 to-slate-950 lg:block">
          <div className="absolute inset-0 bg-gradient-to-br from-black/5 via-transparent to-black/25" />
          {/* 细网格点缀 — 纯 CSS 不增加资源 */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
            <div className="space-y-5 pt-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
                <span className="size-1.5 rounded-full bg-green-300" />
                浙江工商大学 · 学生专属社区
              </div>
              <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
                这里是<span className="text-blue-200">浙小商</span>
                <br />
                们的树洞
              </h1>
              <p className="max-w-md text-base leading-relaxed text-white/80">
                一个只属于浙商大人的匿名校园墙。说想说的话、问想问的事、找想找的人，安全、温暖、有温度。
              </p>
            </div>

            <ul className="grid max-w-xl grid-cols-2 gap-3 pb-4">
              {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
                <li
                  key={title}
                  className="rounded-xl bg-white/10 p-3.5 backdrop-blur-md ring-1 ring-white/15 transition-colors hover:bg-white/15"
                >
                  <Icon className="size-5 text-blue-200" />
                  <p className="mt-2 text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/70">{desc}</p>
                </li>
              ))}
            </ul>

            <p className="text-xs text-white/60">© 2026 浙工商树洞 · 学生自发运营 · 非官方平台</p>
          </div>
        </div>

        <div className="relative flex w-full items-start justify-center px-4 py-8 sm:px-6 sm:py-12 lg:w-[48%] lg:items-center">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background lg:hidden" />
          <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
