import Image from 'next/image';
import { ShieldCheck, Sparkles, MessageSquareHeart, Compass } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: '校园邮箱认证',
    desc: '仅限浙工商师生使用',
    iconBg: 'bg-sky-300/25',
    iconColor: 'text-sky-100',
  },
  {
    icon: MessageSquareHeart,
    title: '匿名树洞畅聊',
    desc: '同帖昵称稳定、跨帖独立，真正放心发声',
    iconBg: 'bg-violet-300/25',
    iconColor: 'text-violet-100',
  },
  {
    icon: Compass,
    title: '选课指南针',
    desc: '学长学姐真实课程评价，避开雷课少走弯路',
    iconBg: 'bg-amber-300/25',
    iconColor: 'text-amber-100',
  },
  {
    icon: Sparkles,
    title: '在线聊天房',
    desc: '房间开放 2 小时，常规记录默认留存 180 天',
    iconBg: 'bg-emerald-300/25',
    iconColor: 'text-emerald-100',
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen bg-[#f5f7fb]">
      <main className="flex min-h-screen w-full flex-col lg:flex-row">
        <section className="relative hidden min-h-screen overflow-hidden bg-slate-950 lg:flex lg:w-[56%]">
          <Image
            src="/campus-aerial.png"
            alt="浙江工商大学校园景色"
            fill
            priority
            sizes="56vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/65 via-slate-950/10 to-slate-950/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/45 via-transparent to-primary/20" />
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.12] mix-blend-soft-light"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative z-10 flex min-h-screen w-full flex-col justify-between p-8 xl:p-14">
            <div className="flex items-center gap-3">
              <BrandMark className="size-10 bg-white text-primary shadow-lg" />
              <div className="text-white">
                <p className="text-sm font-semibold tracking-wide">浙工商树洞</p>
                <p className="mt-0.5 text-xs text-white/65">浙江工商大学 · 学生专属社区</p>
              </div>
            </div>

            <div className="max-w-xl pb-4">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
                <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
                只属于浙商大人的校园空间
              </div>
              <h1 className="max-w-lg text-4xl font-bold leading-[1.12] tracking-[-0.04em] text-white xl:text-6xl">
                在熟悉的校园里，
                <br />
                找到<span className="text-sky-200">同频的人</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/78 xl:text-lg">
                分享经验，交换信息，寻找帮助。一个更真实、更友善的匿名校园社区，从每一次认真表达开始。
              </p>

              <ul className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
                {HIGHLIGHTS.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
                  <li
                    key={title}
                    className="rounded-2xl border border-white/20 bg-white/[0.06] p-4 shadow-[0_14px_35px_-20px_rgba(2,6,23,0.9)] ring-1 ring-inset ring-white/10 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.10]"
                  >
                    <span
                      className={`flex size-9 items-center justify-center rounded-xl ${iconBg}`}
                    >
                      <Icon className={`size-4 ${iconColor}`} />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/75">{desc}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-4 text-xs text-white/55">
              <span>© 2026 浙工商树洞 · 学生自发运营 · 非官方平台</span>
              <span className="hidden tracking-[0.2em] sm:inline">ZJGSU / CAMPUS</span>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen w-full flex-col overflow-hidden bg-background lg:w-[44%]">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-sky-200/25 blur-3xl dark:bg-sky-950/30" />

          <div className="relative h-44 overflow-hidden bg-slate-900 lg:hidden">
            <Image
              src="/campus-aerial.png"
              alt="浙江工商大学校园景色"
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/15 to-slate-950/75" />
            <div className="relative z-10 flex h-full items-end justify-between p-5 text-white">
              <div>
                <p className="text-xs font-medium text-white/70">浙江工商大学 · 学生专属社区</p>
                <p className="mt-1 text-xl font-bold tracking-tight">浙工商树洞</p>
              </div>
              <BrandMark className="size-10 bg-white text-primary shadow-lg" />
            </div>
          </div>

          <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-10 xl:px-14">
            <div className="w-full max-w-[430px] animate-in fade-in slide-in-from-bottom-2 duration-500">
              {children}
            </div>
          </div>

          <p className="relative z-10 pb-5 text-center text-xs text-muted-foreground/70">
            用校园邮箱验证身份，和同学安心交流
          </p>
        </section>
      </main>
    </div>
  );
}
