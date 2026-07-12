import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const metadata = { title: '用户协议' };

export default function TermsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">用户协议</h1>
        <p className="text-sm text-muted-foreground">最后更新: 2026 年 5 月</p>
      </header>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">一、总则</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            欢迎使用浙工商树洞（以下简称「本论坛」）。本论坛是浙江工商大学学生专属的校园社区平台。
          </p>
          <p>
            使用本论坛即表示你已阅读、理解并同意本协议全部条款。如果你不同意其中任何条款,请停止使用本论坛。
          </p>
          <p>
            本论坛仅面向浙江工商大学在读学生开放，注册时需要提供{' '}
            <code className="rounded bg-muted px-1 py-0.5">@pop.zjgsu.edu.cn</code>{' '}
            校园邮箱验证或通过管理员审批。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">二、用户行为规范</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong>遵守法律法规</strong>：不得发布违反中华人民共和国法律法规的内容。
            </li>
            <li>
              <strong>禁止人身攻击</strong>
              ：不得辱骂、诋毁、骚扰其他用户,不得发布涉及种族、性别、地域歧视的言论。
            </li>
            <li>
              <strong>禁止色情内容</strong>：不得发布任何形式的色情、低俗内容。
            </li>
            <li>
              <strong>禁止商业广告</strong>：未经许可不得发布商业广告、推广链接、传销信息。
            </li>
            <li>
              <strong>禁止虚假信息</strong>：不得故意散布谣言、虚假信息或误导性内容。
            </li>
            <li>
              <strong>保护隐私</strong>：未经他人同意,不得公开他人真实姓名、联系方式等个人信息。
            </li>
            <li>
              <strong>尊重知识产权</strong>：不得发布侵犯他人著作权、商标权等知识产权的内容。
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">三、匿名机制说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            本论坛默认以匿名方式显示帖子和评论。同一帖子内,同一用户的匿名昵称保持稳定；不同帖子之间不可关联。
          </p>
          <p>
            仅全站唯一超级管理员可在平台治理或依法协查需要下调阅用户真实身份；每次读取都会自动记录审计。普通管理员和版主无法访问这些身份资料。
          </p>
          <p>私信（DM）功能使用独立于发帖的匿名昵称体系,防止跨帖关联同一用户。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">四、内容管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>管理员和版主有权对违反社区规则的内容进行以下处理：</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>隐藏或删除违规帖子/评论</li>
            <li>锁定帖子（禁止新评论）</li>
            <li>对违规用户进行禁言或封号处理</li>
          </ul>
          <p>所有管理操作均记录在审计日志中,确保可追溯。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">五、免责声明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>本论坛是一个学生自建的校园交流平台,不代表浙江工商大学官方立场。</p>
          <p>用户在本论坛发布的内容仅代表用户个人观点,与本论坛无关。</p>
          <p>本论坛保留随时修改本协议的权利,修改后的协议将在论坛内公布。</p>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        如有疑问,请通过{' '}
        <Link href="/contact" className="underline">
          联系页面
        </Link>{' '}
        与我们取得联系。
      </p>
    </div>
  );
}
