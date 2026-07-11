export default function ContactPage() {
  return (
    <div className="flex-1 w-full max-w-2xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold mb-4">联系我们</h1>
      <div className="prose prose-sm dark:prose-invert">
        <p>如果在产品使用中有任何意见、建议，或者你需要商务合作与问题申诉：</p>
        <p>请发送邮件到如下邮箱地址：</p>
        <p className="font-mono mt-2 mb-4 bg-muted inline-block px-2 py-1 rounded">
          support@zjgsu-treehole.net
        </p>
        <p>我们将会在收到你的邮件后3个工作日内进行回复。</p>
      </div>
    </div>
  );
}
