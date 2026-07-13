import Link from 'next/link';

export const metadata = { title: '隐私政策' };

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">隐私政策</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          我们会在必要范围内处理账号、安全和社区治理数据。
        </p>
      </header>
      <div className="space-y-4 text-sm leading-7 text-muted-foreground">
        <p>我们非常重视用户的隐私保护。在使用浙工商树洞时，可能会收集并使用以下信息：</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">账号信息：</strong>
            注册时使用的 @pop.zjgsu.edu.cn 邮箱用于身份验证，发布内容时默认不公开。
          </li>
          <li>
            <strong className="text-foreground">Cookie 和设备信息：</strong>
            用于保存登录态、个性化配置和安全风控状态。
          </li>
          <li>
            <strong className="text-foreground">社区治理信息：</strong>
            举报、规则确认、审核、申诉和必要的安全日志可能依法保存，用于内容治理和协助调查。
          </li>
        </ul>
        <p>
          你可以申请注销账号。注销不意味着已经形成的必要安全日志、审计记录、举报证据或依法需要保存的记录立即删除；我们会在实现处理目的所必要的期限内保存，并在法律允许时删除或匿名化。
        </p>
        <p>
          关于匿名展示、规则确认、举报证据和违规处置，请同时阅读{' '}
          <Link
            href="/community-rules"
            className="font-medium text-foreground underline underline-offset-4"
          >
            社区规则
          </Link>
          。如需了解数据处理相关问题，可前往{' '}
          <Link
            href="/contact"
            className="font-medium text-foreground underline underline-offset-4"
          >
            联系页面
          </Link>
          。
        </p>
      </div>
    </div>
  );
}
