export default function RulesPage() {
  return (
    <div className="flex-1 w-full max-w-2xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold mb-4">社区规则</h1>
      <div className="prose prose-sm dark:prose-invert space-y-4">
        <p>为了维护良好的社区环境，请大家遵守以下规则：</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>友善交流：</strong>禁止人身攻击、辱骂、歧视等不当言论。
          </li>
          <li>
            <strong>保护隐私：</strong>
            未经同意，不得公开他人的真实姓名、联系方式或其他敏感个人信息。
          </li>
          <li>
            <strong>拒绝违规内容：</strong>严禁发布色情、暴力、引战及违法违规的信息。
          </li>
          <li>
            <strong>不发广告：</strong>禁止商业广告、垃圾信息的刷屏等干扰社区体验的行为。
          </li>
        </ul>
        <p>违反上述规则的用户可能会被封禁账号。共创和谐社区环境！</p>
      </div>
    </div>
  );
}
