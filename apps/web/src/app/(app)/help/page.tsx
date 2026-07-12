export default function HelpPage() {
  return (
    <div className="flex-1 w-full max-w-2xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold mb-4">帮助中心</h1>
      <div className="prose prose-sm dark:prose-invert space-y-4">
        <h3>如何发帖？</h3>
        <p>
          点击左侧导航栏的“发布帖子”按钮，即可编辑并发布。请选择最相关的主题频道，方便同学查找，也便于社区统一管理。
        </p>

        <h3>如何匿名？</h3>
        <p>
          在发贴或者评论时，你可以选择开启匿名模式，系统将会隐去你的真实ID，给你一个随机分配的代号。
        </p>

        <h3>忘记密码怎么办？</h3>
        <p>请联系管理员验证学生邮箱后进行密码重置。</p>
      </div>
    </div>
  );
}
