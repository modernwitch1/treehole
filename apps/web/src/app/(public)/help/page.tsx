export const metadata = { title: '帮助中心' };

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">帮助中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          账号、内容和社区使用问题可以先从这里查找答案。
        </p>
      </header>
      <div className="space-y-4 text-sm leading-7 text-muted-foreground">
        <section>
          <h2 className="font-semibold text-foreground">如何注册和登录？</h2>
          <p className="mt-1">
            使用浙工商校园邮箱完成验证，设置密码后在登录页填写学号和密码。验证码没有收到时，请检查垃圾邮件并等待发送服务完成；注册页面也提供重新发送入口。
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-foreground">如何发帖或评价美食？</h2>
          <p className="mt-1">
            登录后从导航进入发布帖子、课程评价或美食窗口页面。发布前请确认内容真实、合法、尊重他人，并阅读社区规则。
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-foreground">如何举报或申诉？</h2>
          <p className="mt-1">
            使用内容旁的“举报”入口提交具体原因和必要证据。账号处罚或误处置可以通过站内入口申请复核；涉及现实紧急危险，请直接联系
            110、120 或学校相关部门。
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-foreground">如何联系我们？</h2>
          <p className="mt-1">
            产品建议、问题申诉和商务合作请发送邮件至{' '}
            <a
              className="font-medium text-foreground underline"
              href="mailto:support@zjgsu-treehole.net"
            >
              support@zjgsu-treehole.net
            </a>
            。
          </p>
        </section>
      </div>
    </div>
  );
}
