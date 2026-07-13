import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const metadata = { title: '用户协议' };

export default function TermsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">用户协议</h1>
        <p className="text-sm text-muted-foreground">最后更新：2026 年 7 月</p>
      </header>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">一、总则</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            欢迎使用浙工商树洞（以下简称“本论坛”）。本论坛是面向浙江工商大学师生的校园社区平台。
          </p>
          <p>
            使用本论坛即表示你已阅读、理解并同意本协议全部条款。如果你不同意其中任何条款，请停止使用本论坛。
          </p>
          <p>
            本论坛注册时需要提供{' '}
            <code className="rounded bg-muted px-1 py-0.5">@pop.zjgsu.edu.cn</code>{' '}
            校园邮箱验证或通过管理员审批。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">二、用户行为规范</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">遵守法律法规：</strong>
              不得发布违反中华人民共和国法律法规的内容。
            </li>
            <li>
              <strong className="text-foreground">禁止人身攻击：</strong>
              不得辱骂、诋毁、骚扰其他用户，不得发布歧视性言论。
            </li>
            <li>
              <strong className="text-foreground">禁止色情内容：</strong>
              不得发布任何形式的色情、低俗内容。
            </li>
            <li>
              <strong className="text-foreground">禁止未经许可的广告：</strong>
              广告和商业推广应遵守平台规则并发布在相应模块。
            </li>
            <li>
              <strong className="text-foreground">禁止虚假信息：</strong>
              不得故意散布谣言、虚假信息或误导性内容。
            </li>
            <li>
              <strong className="text-foreground">保护隐私：</strong>
              未经同意不得公开他人真实姓名、联系方式等个人信息。
            </li>
            <li>
              <strong className="text-foreground">尊重知识产权：</strong>
              不得发布侵犯他人著作权、商标权等知识产权的内容。
            </li>
            <li>
              <strong className="text-foreground">用户自行负责：</strong>
              你对自己发布、发送、上传或管理的内容及其真实性、合法性、授权情况和由此产生的后果负责。详细要求请阅读{' '}
              <Link
                href="/community-rules"
                className="font-medium text-foreground underline underline-offset-4"
              >
                社区规则
              </Link>
              。
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">三、匿名机制说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            本论坛默认以匿名方式显示帖子和评论。同一帖子内，同一用户的匿名昵称保持稳定；不同帖子之间不可关联。
          </p>
          <p>
            仅全站唯一超级管理员可在平台治理或依法协查需要下调阅用户真实身份；每次读取都会自动记录审计。
          </p>
          <p>私信使用独立于发帖的匿名昵称体系，防止跨帖关联同一用户。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">四、内容管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>平台会依法依规处理举报、投诉、违规内容、证据保存和有权机关的调查协助。</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>隐藏、删除或限制传播违规内容</li>
            <li>锁定讨论或限制部分功能</li>
            <li>对违规用户进行警告、禁言、暂停或封禁</li>
          </ul>
          <p>管理操作会在必要范围内记录审计信息，以确保处理可追溯。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">五、责任边界</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>本论坛是学生自建的校园交流平台，不代表浙江工商大学官方立场。</p>
          <p>
            用户对自己发布的内容及其真实性、合法性和由此产生的法律、校规后果负责；平台不对用户内容作事实、交易、医疗或法律背书。
          </p>
          <p>
            上述约定不排除平台依法承担的内容治理、个人信息保护、举报处理、记录保存和协助调查义务。
          </p>
          <p>
            如有疑问，请通过
            <Link href="/contact" className="mx-1 font-medium text-foreground underline">
              联系页面
            </Link>
            与我们取得联系。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
