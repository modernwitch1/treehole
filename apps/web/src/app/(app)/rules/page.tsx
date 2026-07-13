import Link from 'next/link';
import { BookOpen, ExternalLink, HeartHandshake, Scale, ShieldAlert } from 'lucide-react';
import { COMMUNITY_RULES_VERSION } from '@/lib/community-safety';

export const metadata = { title: '社区规则' };

const sections = [
  {
    id: 'scope',
    title: '一、适用范围与规则效力',
    items: [
      '本规则适用于浙工商校园墙的全部功能和内容，包括帖子、评论、引用、课程评价、私信、聊天室、板块申请、个人资料、图片、链接，以及美食模块中的商家、商品、广告和评价。',
      '你在站内创建、上传、发送、编辑、转发或管理内容时，都应同时遵守中华人民共和国法律法规、监管要求、浙江工商大学现行校规和本规则。不同规则存在冲突时，以法律法规和其他强制性规定为准。',
      '本网站是学生自建的校园交流服务，不代表浙江工商大学的官方立场，也不代表学校、教师、商家或任何被提及的个人发表意见、作出授权或提供保证。',
    ],
  },
  {
    id: 'responsibility',
    title: '二、账号、内容与用户责任',
    items: [
      '账号由注册者本人使用。你应妥善保管登录凭据，不得出借、出租、出售、共享账号，不得冒用他人身份或利用他人账号发布内容。账号下产生的操作，原则上由账号持有人负责。',
      '发布者是其内容的直接提供者。你应对内容的真实性、合法性、准确性、完整性、来源、授权情况以及由此产生的民事、行政、刑事和校规后果承担相应责任。',
      '平台不对用户内容作事实、商业、医疗、法律或安全背书，也不保证用户内容一定真实、完整、及时或适合任何用途。阅读、转发或依据用户内容作出决定前，请自行核验。',
      '“匿名展示”只是面向普通用户的展示方式，不是对发布者的责任豁免。不得以匿名、马甲、暗语、图片、外链或私信为由规避法律、校规或本规则。',
      '上述责任安排用于明确用户与平台之间的责任边界，不构成平台对法定义务的放弃。平台仍会依法处理举报、投诉、删除或屏蔽请求、证据保存、监管要求和有权机关的调查协助。',
    ],
  },
  {
    id: 'red-lines',
    title: '三、违法、危险与违禁信息（零容忍）',
    items: [
      '不得发布、交易、求购、招募、教授或引导实施违法犯罪行为，包括诈骗、赌博、传销、洗钱、盗窃、敲诈勒索、非法集资、代考作弊、侵入计算机系统、制作传播恶意程序等。',
      '不得发布毒品、枪支弹药、爆炸物、管制器具、危险化学品、假证件、非法药物或其他法律法规禁止交易、携带或使用的物品和服务信息。',
      '不得威胁他人人身安全、煽动暴力或现实线下围堵，不得教唆自杀、自残、伤害他人或实施危险挑战；发现现实紧急风险时，应立即联系 110、120、学校保卫部门或其他专业救助渠道。',
      '不得发布危害国家安全、破坏社会公共秩序、传播恐怖主义或极端主义、煽动民族仇恨、宣扬邪教、传播淫秽色情或其他法律明确禁止的信息。',
    ],
  },
  {
    id: 'minors',
    title: '四、色情低俗与未成年人保护',
    items: [
      '禁止色情、招嫖、性交易、露骨性描写、性暗示引流、淫秽图片或视频，以及以猎奇方式传播严重血腥、虐待、残酷伤害内容。',
      '严禁任何涉及未成年人的色情、性剥削、诱导、胁迫、交易、交换或传播行为；不得以“玩笑”“二次元”“艺术”或匿名为理由规避处理。',
      '医学、心理、性教育、法律咨询和受害者求助内容会结合上下文判断，但不得借教育、科普或求助名义发布无关的露骨内容或进行不当引流。',
      '不得以年龄、外貌、性别、性取向、残障、疾病或其他个人特征对他人进行性骚扰、羞辱、歧视或恶意标签化。',
    ],
  },
  {
    id: 'harassment',
    title: '五、人身攻击、网暴、歧视与造谣',
    items: [
      '不得辱骂、贬损、威胁、持续骚扰、恶意围攻、煽动“挂人”、组织线下找人或诱导他人对某个用户进行集中攻击。',
      '不得捏造事实、明知不实仍传播，或通过断章取义、移花接木、伪造聊天记录等方式损害他人名誉、信用、职业或学业评价。',
      '允许基于真实经历和可核验事实的批评、课程评价、消费维权、校园事务讨论和公共议题表达，但应针对行为、服务或观点，不得把未经证实的指控写成确定事实。',
      '涉及具体个人、教师、学生组织或商家时，应尽量提供时间、地点、事项和可核验依据；不鼓励公开无关身份信息，也不得以“曝光”为名进行报复或索取财物。',
    ],
  },
  {
    id: 'privacy',
    title: '六、隐私、个人信息与“开盒”',
    items: [
      '未经本人明确授权或法律允许，不得公开、交换、出售或引导他人搜集姓名与身份组合、学号、身份证号、手机号、邮箱、住址、宿舍、课程表、行踪、车牌、健康信息、账号凭据等个人信息。',
      '不得发布他人的脸部、声音、聊天记录、私信、录音录像、医疗或亲密关系材料；即使内容来自真实事件，也应遮盖与解决问题无关的身份线索，并取得必要授权。',
      '不得通过拼音、谐音、首字母、打码不充分、二维码、定位、照片背景、外链或分段发送等方式变相识别、拼接或泄露他人身份。',
      '如需寻人、失物招领、维权或求助，应遵循最小必要原则，不要公开联系方式和精确位置；涉及个人信息的举报材料仅提供给平台或有权处理部门，不要在公开区二次传播。',
    ],
  },
  {
    id: 'campus',
    title: '七、校园秩序、学术诚信与公共议题',
    items: [
      '不得组织、煽动或宣传打架斗殴、非法聚集、堵塞通道、扰乱教学考试秩序、破坏公共设施、恶意占用资源或其他影响校园正常秩序的行为。',
      '不得发布代考、替课、买卖考试答案、论文或作业、伪造证明、冒用教师或学校部门名义办事等破坏学术诚信和校园管理秩序的信息。',
      '讨论学校政策、课程、教师、宿舍、食堂和学生服务时，可以表达不满和提出改进建议；请避免将个人体验扩大为未经证实的全称结论，不得以批评为名实施人身攻击。',
      '学校有权依据学生管理规定、网络使用规定及其他校规对学生行为作出处理。平台的内容处置不替代学校、公安、司法或其他主管部门的职权处理。',
    ],
  },
  {
    id: 'commercial',
    title: '八、广告、交易与美食模块',
    items: [
      '广告、招聘、二手交易、社团活动和商家推广应发布在允许的板块或美食模块，不得刷屏、重复发布、批量私信、强制加群、诱导站外交易或利用标题规避审核。',
      '禁止虚假宣传、刷单返利、兼职诈骗、钓鱼链接、冒充客服、非法金融和传销信息。涉及价格、库存、配送、售后、食品安全和资质的内容，应由发布者和商家自行核验并承担相应责任。',
      '用户评价应基于真实消费或实际体验，尽量描述具体窗口、商品、时间和问题，不得以差评威胁、恶意索赔、编造食安事故或公开员工个人信息。',
      '商家后台仅用于管理美食模块的店铺、商品、广告、评价和回复。商家员工不得查看或传播论坛其他模块内容；商家账号不得借助后台权限接触与履职无关的用户身份资料。',
      '平台提供信息展示和沟通工具，不是食品经营者、配送方、支付方或交易担保方。食品、交易、售后和消费者权益争议应依法向经营者及有关部门主张权利。',
    ],
  },
  {
    id: 'copyright',
    title: '九、知识产权与内容授权',
    items: [
      '仅发布你本人创作或已取得合法授权的文字、图片、视频、音乐、商标、课程资料和其他内容，不得盗用他人作品、冒充原创或删除来源和署名。',
      '不得上传付费课程、试题答案、内部文件、未公开科研资料或其他受限制传播的材料；不得利用平台帮助他人绕过访问控制或版权保护。',
      '你应确保发布内容不会侵犯他人的著作权、商标权、肖像权、名誉权、隐私权、个人信息权益或其他合法权益。权利人可通过举报入口提交权属和侵权证据，平台会依法依规处理。',
    ],
  },
  {
    id: 'abuse',
    title: '十、平台功能滥用与安全',
    items: [
      '不得批量注册、买卖账号、共享验证码、冒用邮箱、绕过风控或封禁、操纵点赞/投票/举报、制造虚假热度或恶意压低他人内容。',
      '不得抓取、扫描、撞库、钓鱼、植入恶意代码、攻击接口、干扰服务、测试越权、探测或访问不属于你的管理数据。发现安全问题应通过帮助中心私下报告，不要公开利用。',
      '不得利用举报、申诉、版权投诉或客服渠道恶意骚扰、报复他人，或提交伪造、篡改、批量重复材料。',
      '不得以任何方式诱导用户交出密码、验证码、校园邮箱、支付信息或其他敏感凭据。平台工作人员不会索要完整密码或一次性验证码。',
    ],
  },
  {
    id: 'anonymous',
    title: '十一、匿名、日志与证据保全',
    items: [
      '帖子、评论和私信可以匿名显示给普通用户，但平台仍可能在最小必要范围内记录账号、登录、设备、网络、安全风控、举报和规则确认等数据，具体以《隐私政策》为准。',
      '仅全站唯一超级管理员可通过受控流程调阅匿名身份映射；普通管理员、版主和商家员工不能访问该资料。每次涉及身份的读取都会写入审计记录，并受权限和必要性约束。',
      '聊天室记录常规默认保存 180 天，部署者可在 30–3650 天范围内配置；标记为证据保全（legal hold）的记录不会按常规期限自动删除。私信没有自动过期机制。',
      '遇到举报、申诉、现实安全风险、监管要求或有权机关依法调取时，相关记录可能被暂缓删除、限制访问或依法提供。删除账号或内容不当然意味着已经形成的必要审计和证据记录立即消失。',
    ],
  },
  {
    id: 'moderation',
    title: '十二、审核、举报与平台处置',
    items: [
      '平台会结合自动风险识别、用户举报、人工复核、上下文、行为历史、影响范围和现实危害进行治理。自动识别用于辅助发现风险，不等于对事实或责任的最终判断。',
      '在法律法规、监管要求、学校协查或保护用户安全所必要的范围内，平台可以拒绝发布、暂缓展示、限制传播、删除、屏蔽、断开链接、关闭互动、限制账号功能、保存证据并向有关部门报告。',
      '举报不代表被举报者当然违法，也不代表举报者当然正确。请提供内容链接、时间、具体原因和必要证据，不要在公开区重复传播疑似违规内容。',
      '如内容被错误处置或账号受到处罚，可通过帮助中心提交事实清楚的申诉。复核会参考规则条款、内容上下文和处置证据；辱骂审核人员、反复刷屏或伪造材料不会提高成功率。',
    ],
  },
  {
    id: 'sanctions',
    title: '十三、违规等级与处置措施',
    items: [
      '一般违规可能受到提示教育、删除或隐藏内容、降低展示、锁定讨论、警告、短期禁言、限制发帖/评论/私信等处理。',
      '重复违规、规避处置、恶意骚扰、操纵平台或造成较大影响的，可能受到延长禁言、限制登录、暂停账号、永久封禁及禁止重新注册等处理。',
      '诈骗、暴力威胁、未成年人性剥削、恶意泄露隐私、严重诽谤、黑客攻击、危害公共安全和其他涉嫌违法犯罪的行为，可以直接采取最严厉的平台措施，不要求先经过较轻处罚。',
      '平台处置不影响权利人、学校或有权机关依法追究发布者的民事、行政、刑事或校规责任；平台会在法律允许和必要范围内配合处理。',
    ],
  },
  {
    id: 'appeal',
    title: '十四、举报、申诉与紧急求助',
    items: [
      '举报内容请使用内容旁的“举报”入口；涉及私信或聊天室时，优先举报对应消息或会话，并说明你希望平台采取的措施。',
      '如果你是被举报内容的发布者，可以通过帮助中心申请复核，说明事实、来源、授权或上下文。申诉期间原处置可能维持，除非复核认为需要调整。',
      '平台不是 110、120、心理危机干预、法律援助或食品安全监管机构。人身危险、急性医疗风险、正在发生的犯罪或食品安全紧急事件，请直接联系相应专业机构，同时可以向平台报告以便采取站内措施。',
    ],
  },
  {
    id: 'updates',
    title: '十五、规则更新与确认',
    items: [
      '平台会根据法律法规、监管要求、学校规则、产品功能和治理实践更新本规则，并在页面显示生效版本和日期。',
      '涉及用户重要权利义务的更新，平台可能要求重新阅读并确认；新注册用户前 7 天每天首次进入时需要确认社区规则，未确认前不能继续使用社区服务。',
      '确认规则表示你已获得清晰告知并承诺遵守，不表示平台可以免除法定内容治理、个人信息保护、通知处理、记录保存或协助调查义务，也不表示你放弃法律赋予的申诉、投诉和救济权利。',
    ],
  },
];

const officialReferences = [
  {
    title: '浙江工商大学网络使用行为管理办法',
    href: 'https://nic.zjgsu.edu.cn/2021/1208/c1214a100751/page.htm',
    description: '学校网络使用、禁止内容、报告义务和违规处理依据。',
  },
  {
    title: '浙江工商大学学生手册',
    href: 'https://xsc.zjgsu.edu.cn/2020/0828/c1799a56629/page.htm',
    description: '学生管理、纪律处分及校内相关制度入口。',
  },
  {
    title: '网络信息内容生态治理规定',
    href: 'https://www.cac.gov.cn/2019-12/20/c_1578375159509309.htm',
    description: '网络平台内容治理、举报、审核、记录和应急处置要求。',
  },
  {
    title: '网络暴力信息治理规定',
    href: 'https://www.cac.gov.cn/2024-06/14/c_1720043894161555.htm',
    description: '网络暴力、评论区和匿名互动治理要求。',
  },
  {
    title: '中华人民共和国个人信息保护法',
    href: 'https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html',
    description: '个人信息处理、保护和责任边界。',
  },
];

export default function RulesPage() {
  return (
    <main className="w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="size-4" />
          <span>浙工商校园墙 · 社区治理</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">社区规则</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          本规则把校园表达、用户责任、匿名边界、内容治理和申诉流程写清楚。请在发帖、评论、私信、创建聊天室或使用美食模块前阅读。
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>生效版本：{COMMUNITY_RULES_VERSION}</span>
          <span>适用对象：所有注册用户、管理员、版主和商家员工</span>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="min-w-0 space-y-8 text-sm leading-7">
          <section
            id="public-space"
            className="scroll-mt-6 rounded-2xl border-2 border-primary/25 bg-primary/[0.06] p-5 md:p-7"
            aria-labelledby="public-space-title"
          >
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <HeartHandshake className="size-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary">给每一位用户的一句话</p>
                <h2
                  id="public-space-title"
                  className="mt-2 text-2xl font-bold leading-tight tracking-tight md:text-3xl"
                >
                  这是我们共同使用的校园公共品。
                </h2>
                <p className="mt-4 text-base leading-7 text-foreground/80">
                  浙工商校园墙是一项服务学生的公益产品。它诞生的初衷，是帮助大家打破校园里的信息差：分享真实的课程、食堂和生活经验，寻找互助，让需要帮助的人更容易被看见，也让有价值的信息能够流动起来。
                </p>
                <p className="mt-3 text-base leading-7 text-foreground/80">
                  这里不是某个人可以随意维护的私人物品，也不是可以把情绪、谣言和恶意丢给别人的地方。平台能否长期值得信任，取决于每一位用户的道德感、同理心，以及对这个公共空间的尊重。匿名可以降低表达的负担，但不会降低我们对他人和社区应有的责任。
                </p>
                <p className="mt-4 text-base font-semibold leading-7 text-foreground">
                  请和我们一起维护一个和平、文明、真实、互助的校园社区。发布前多核实一步，表达时多尊重一点；请不要为了短暂的围观、发泄或流量，破坏大家共同建设的平台，更不要违反社区规则。
                </p>
              </div>
            </div>
          </section>

          <section
            className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4"
            aria-labelledby="important-notice"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-1 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h2 id="important-notice" className="font-semibold">
                  再把责任边界说清楚
                </h2>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">你的内容，你负责：</strong>
                    你发出的文字、图片、链接、评价和指控由你自己作出。如果内容违法、失实、侵权、违约或违反校规，相关后果由你承担。匿名只是对普通用户隐藏身份，不是免除责任。
                  </li>
                  <li>
                    <strong className="text-foreground">平台不替任何人背书：</strong>
                    本站是学生自建的校园服务，不代表浙江工商大学官方立场，也不为用户观点、广告、交易、评价或指控的真实性和安全性作保证。
                  </li>
                  <li>
                    <strong className="text-foreground">规则不是逃避法律的工具：</strong>
                    平台会依法受理举报和投诉，处理违规内容，保存必要证据，并在法定范围内配合学校或有权机关调查。用户责任和平台依法承担的治理义务同时存在，互不替代。
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          <section id="references" className="scroll-mt-6 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Scale className="size-4" />
              <h2 className="font-semibold">参考依据与重要说明</h2>
            </div>
            <p className="mt-2 text-muted-foreground">
              以下链接用于帮助用户理解规则背景，不替代法律意见、学校正式通知或有权机关的决定。学校制度和法律法规可能更新，请以发布机关的最新正式文本为准。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {officialReferences.map((reference) => (
                <a
                  key={reference.href}
                  href={reference.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-lg border bg-background p-3 transition-colors hover:border-foreground/30"
                >
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    {reference.title}
                    <ExternalLink className="size-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {reference.description}
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-muted/30 p-4">
            <h2 className="font-semibold">需要帮助或发现违规？</h2>
            <p className="mt-2 text-muted-foreground">
              请使用内容旁的“举报”入口并选择准确原因；涉及私信或聊天室消息时，请优先逐条举报，以便系统保全对应证据。账号、申诉和其他问题可前往
              <Link
                href="/help"
                className="mx-1 font-medium text-foreground underline underline-offset-4"
              >
                帮助中心
              </Link>
              。
            </p>
          </section>
        </article>

        <aside className="order-first h-fit rounded-xl border bg-card p-4 lg:order-last lg:sticky lg:top-6">
          <p className="text-sm font-semibold">本页目录</p>
          <nav className="mt-3 space-y-1 text-xs leading-5" aria-label="社区规则目录">
            <a
              href="#public-space"
              className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              公共空间倡议
            </a>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {section.title}
              </a>
            ))}
            <a
              href="#references"
              className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              参考依据
            </a>
          </nav>
        </aside>
      </div>
    </main>
  );
}
