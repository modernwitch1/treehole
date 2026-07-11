export default function PrivacyPage() {
  return (
    <div className="flex-1 w-full max-w-2xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold mb-4">隐私政策</h1>
      <div className="prose prose-sm dark:prose-invert space-y-4">
        <p>我们非常重视用户的隐私保护。在使用浙工商树洞时，我们将会收集并使用你的相关信息：</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>账号信息：</strong>注册时使用的 @pop.zjgsu.edu.cn
            邮箱仅作为身份验证用途，发贴时默认不再展示。
          </li>
          <li>
            <strong>Cookie技术：</strong>我们利用Cookie保存用户的登录态与个性化配置（如明暗主题）。
          </li>
          <li>
            <strong>数据安全：</strong>我们将采取严格的加密手段保护你的数据和私聊信息不被泄露。
          </li>
        </ul>
        <p>你始终有权选择注销账号并非恢复地清除在此社区的所有操作记录。</p>
      </div>
    </div>
  );
}
