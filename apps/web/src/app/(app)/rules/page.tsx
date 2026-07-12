import Link from 'next/link';
import { COMMUNITY_RULES_VERSION } from '@/lib/community-safety';

const prohibitedSections = [
  {
    title: '违法、危险与违禁内容',
    items: [
      '不得传播违法犯罪方法、诈骗、赌博、毒品、管制物品交易、暴力恐怖或危害公共安全的信息。',
      '不得煽动违法活动、制造或传播有现实伤害风险的威胁，也不得冒充学校、平台或他人实施欺骗。',
      '发现紧迫的人身安全风险时，请优先联系学校保卫部门、警方或其他紧急救助渠道。',
    ],
  },
  {
    title: '色情低俗与未成年人保护',
    items: [
      '禁止色情招嫖、露骨性描写、性暗示引流，以及以猎奇方式传播血腥、虐待等令人严重不适的内容。',
      '严禁任何涉及未成年人的色情、性剥削、诱导或交换相关材料的行为。',
      '医学、健康、教育和求助语境会结合上下文判断，不会仅因出现某个词语自动处罚。',
    ],
  },
  {
    title: '攻击、骚扰、歧视与造谣',
    items: [
      '不得辱骂、人身攻击、歧视、持续骚扰、恶意围攻、威胁或诱导他人自伤。',
      '不得捏造或明知不实仍传播损害他人名誉的信息；引用未经证实的消息时应明确说明来源和不确定性。',
      '允许基于事实的批评、课程评价、消费维权和公共议题讨论，但应针对行为和观点，不应对个人进行羞辱或“开盒”。',
    ],
  },
  {
    title: '隐私与个人信息',
    items: [
      '未经本人明确同意，不得公开姓名与身份的组合、学号、身份证号、住址、联系方式、行踪、账号凭据、私聊截图等敏感信息。',
      '不得以拼音、谐音、图片、二维码或分段发送等方式规避检测和识别他人。',
      '求助或曝光事件时请遮盖无关个人信息，只提供解决问题所需的最少内容。',
    ],
  },
  {
    title: '广告、诈骗与平台滥用',
    items: [
      '禁止垃圾广告、刷屏、恶意引流、兼职刷单、虚假交易、钓鱼链接、联系方式轰炸和批量私信。',
      '不得操纵点赞、举报或投票，不得批量注册、绕过封禁、规避敏感词或干扰审核。',
      '正常的校园互助、二手交易和社团活动应发布在合适板块，并如实说明价格、身份与风险。',
    ],
  },
];

export default function RulesPage() {
  return (
    <main className="w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">社区规则</h1>
        <p className="text-sm text-muted-foreground">
          版本 {COMMUNITY_RULES_VERSION} · 适用于帖子、评论、课程评价、私信和聊天房
        </p>
      </div>

      <div className="mt-6 space-y-8 text-sm leading-7">
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <h2 className="font-semibold">先说最重要的</h2>
          <p className="mt-1 text-muted-foreground">
            匿名仅面向普通用户，并不意味着无法追责。平台会在最小必要范围内保存安全日志和举报证据；仅全站唯一超级管理员可调阅匿名用户真实身份，每次读取都会自动写入审计。普通管理员和版主无法访问这些身份资料；涉嫌违法违规时，平台可依法依规配合学校相关部门或有权机关调查。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">聊天房记录与证据保全</h2>
          <p className="mt-2 text-muted-foreground">
            聊天房关闭或过期仅表示停止发言，不代表记录立即删除。聊天房常规记录默认留存 180
            天，部署者可在 30–3650
            天范围内配置；标记为证据保全（legalHold）的记录不会被自动删除。仅全站唯一超级管理员可通过受控权限进行溯源，每次查询都会自动写入审计。私信没有自动过期机制，不适用上述聊天房留存期限。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">一、共同底线</h2>
          <p className="mt-2 text-muted-foreground">
            请尊重法律、事实和他人的安全边界。不要尝试用缩写、同音字、空格、图片、外链或私信来规避规则；私密渠道同样不是规则之外的空间。
          </p>
        </section>

        {prohibitedSections.map((section, index) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">
              {index + 2}、{section.title}
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="text-lg font-semibold">七、平台如何处理</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>发送前提示并要求确认规则；系统可能对文字、链接和图片进行风险检测。</li>
            <li>
              明显违规内容会被拒绝；存在上下文判断空间的内容会先进入人工审核，审核通过前不向其他用户展示。
            </li>
            <li>举报会固化当时的必要证据。多次举报只用于提高处理优先级，不代表自动判定有罪。</li>
            <li>
              管理员结合上下文、行为历史、影响范围和主观恶意作出决定，敏感处置会写入审计记录。
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold">八、处罚阶梯</h2>
          <p className="mt-2 text-muted-foreground">
            处置可能包括提醒教育、内容限流或隐藏、警告、限制发帖或私信、短期禁言、长期停用和永久封禁。平台会综合严重程度、是否重复、是否主动纠正以及现实危害决定处罚；严重违法、诈骗、威胁、未成年人性剥削或恶意泄露隐私等行为可跳过较轻步骤，并依法采取证据保全和报告措施。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">九、申诉与纠错</h2>
          <p className="mt-2 text-muted-foreground">
            如果你认为内容被误判或处罚不当，可在处罚记录中提交一次有事实依据的申诉。复核人员会查看规则条款、内容上下文和证据，原则上不由原处置人员单独完成复核。辱骂审核人员、重复刷申诉或伪造材料不会加快处理。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">十、正常表达与求助保护</h2>
          <p className="mt-2 text-muted-foreground">
            平台不会因为观点尖锐、对学校或公共事务提出批评、描述受害经历、寻求心理或医疗帮助，就当然认定违规。自动系统只用于发现风险，最终判断应考虑上下文。紧急求助内容可能被优先转交人工处理，但平台不能替代专业的医疗、心理、法律或紧急服务。
          </p>
        </section>

        <section className="rounded-xl border bg-muted/30 p-4">
          <h2 className="font-semibold">需要帮助或发现违规？</h2>
          <p className="mt-1 text-muted-foreground">
            请使用内容旁的“举报”入口并选择准确原因；涉及具体私信或聊天房消息时，请优先逐条举报，以便系统保全对应证据。其他问题可前往
            <Link
              href="/help"
              className="mx-1 font-medium text-foreground underline underline-offset-4"
            >
              帮助中心
            </Link>
            。
          </p>
        </section>
      </div>
    </main>
  );
}
