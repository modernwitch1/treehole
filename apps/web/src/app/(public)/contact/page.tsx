export const metadata = { title: '联系我们' };

export default function ContactPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">联系我们</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          意见建议、问题申诉和商务合作可以通过邮件联系。
        </p>
      </header>
      <div className="space-y-4 text-sm leading-7 text-muted-foreground">
        <p>请发送邮件到：</p>
        <a
          href="mailto:support@zjgsu-treehole.net"
          className="inline-flex rounded-lg bg-muted px-3 py-2 font-mono text-foreground hover:bg-muted/80"
        >
          support@zjgsu-treehole.net
        </a>
        <p>我们会在收到邮件后 3 个工作日内尽量回复。</p>
      </div>
    </div>
  );
}
