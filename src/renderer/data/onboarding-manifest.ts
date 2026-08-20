/**
 * 图文说明书（onboarding guide）清单 —— renderer 侧纯静态数据，离线可用、随版本发布。
 *
 * 图片资源约定（docs/配置体系优化落地实现方案.md §1.2）：
 *   截图放 public/onboarding/<key>/n.png（1080 宽 PNG、红框/箭头标注、单张 < 200KB），
 *   平台页面改版时只换图、代码零改动。本批暂未提供真实截图，
 *   GuideCarousel 会在图片缺失或加载失败时优雅降级为占位卡（大号步骤序号 + 文案）。
 */

export interface GuideStep {
  /** 可选截图：相对项目根的 public/ 路径，如 public/onboarding/ai-key/1.png；缺省时组件显示占位卡 */
  image?: string
  /** 该步骤的操作说明（具体可执行，每步 ≤3 行，纯中文） */
  caption: string
}

export interface GuideManifest {
  /** 指南唯一标识（GuideCarousel 的 guideKey） */
  key: string
  /** 弹层标题 */
  title: string
  /** 有序步骤 */
  steps: GuideStep[]
  /** 「去操作」按钮的外链；缺省时不显示该按钮 */
  actionUrl?: string
}

export const GUIDE_MANIFESTS: readonly GuideManifest[] = [
  {
    key: 'ai-key',
    title: '申请 API Key',
    actionUrl: 'https://platform.deepseek.com/api_keys',
    steps: [
      {
        image: 'public/onboarding/ai-key/1.png',
        caption:
          '打开 DeepSeek 开放平台并登录（右上角「登录/注册」，支持手机号或微信）；OpenAI 等其他平台请前往各自控制台的「API Keys」页面。',
      },
      {
        image: 'public/onboarding/ai-key/2.png',
        caption: '点击「创建 API Key」，按提示命名并完成创建。',
      },
      {
        image: 'public/onboarding/ai-key/3.png',
        caption:
          '复制以 sk- 开头的密钥，回到 PodMuse 粘贴到上方「API Key」输入框，点「加载模型」验证是否可用。',
      },
    ],
  },
  {
    key: 'feishu',
    title: '连接飞书（企业自建应用）',
    actionUrl: 'https://open.feishu.cn/app',
    steps: [
      {
        image: 'public/onboarding/feishu/1.png',
        caption:
          '打开飞书开放平台并登录，进入「开发者后台」，点击「创建企业自建应用」，填写应用名称与描述。',
      },
      {
        image: 'public/onboarding/feishu/2.png',
        caption:
          '进入应用「凭证与基础信息」页，复制 App ID；App Secret 点击「查看」后复制（请勿泄露给他人）。',
      },
      {
        image: 'public/onboarding/feishu/3.png',
        caption: '在「添加应用能力」中开启「机器人」，然后创建版本并发布，应用才能被拉进群聊。',
      },
      {
        image: 'public/onboarding/feishu/4.png',
        caption:
          '回到飞书客户端，把应用机器人拉进目标群聊；在群「设置 → 群信息」复制群号（oc_ 开头）作为 Chat ID。',
      },
    ],
  },
  {
    key: 'douyin',
    title: '连接抖音（扫码登录）',
    steps: [
      {
        image: 'public/onboarding/douyin/1.png',
        caption: '点击「连接抖音」按钮，弹出抖音登录窗口。',
      },
      {
        image: 'public/onboarding/douyin/2.png',
        caption: '用抖音 App 扫码登录，成功后窗口自动关闭并完成配置，登录状态仅保存在本机，全程无需手动复制 Cookie。',
      },
    ],
  },
  {
    key: 'notion',
    title: '连接 Notion（Integration Token）',
    actionUrl: 'https://www.notion.so/my-integrations',
    steps: [
      {
        image: 'public/onboarding/notion/1.png',
        caption: '打开 Notion「我的集成」页面并登录，点击「新建集成」，填写名称并选择所属工作区。',
      },
      {
        image: 'public/onboarding/notion/2.png',
        caption: '创建完成后，在「内部集成密钥」一栏点击「显示」并复制以 secret_ 开头的 token。',
      },
      {
        image: 'public/onboarding/notion/3.png',
        caption:
          '回到 Notion，打开目标数据库页面，右上角「… → 连接」选择刚才创建的集成；复制页面 URL 中的 32 位 database id。',
      },
    ],
  },
  {
    key: 'whisper',
    title: '安装语音识别引擎',
    steps: [
      {
        image: 'public/onboarding/whisper/1.png',
        caption:
          '点击「自动检测引擎」定位已安装的引擎；若未安装，点「一键安装 Faster-Whisper-XXL」（约 1.4GB）或「GitHub 下载」手动安装。默认模型 large-v3-turbo（约 6GB）首次使用自动下载。',
      },
    ],
  },
  {
    key: 'dirs',
    title: '选择笔记目录',
    steps: [
      {
        image: 'public/onboarding/dirs/1.png',
        caption:
          '不选择任何目录时，PodMuse 会在系统文档目录自动创建「播客笔记」文件夹；也可以点「浏览」选择已有文件夹，若其中存在 .obsidian 文件夹会自动识别为 Obsidian Vault 并复用。',
      },
    ],
  },
]

/** 按 key 查找指南；未找到返回 null（GuideCarousel 会显示空态提示） */
export function resolveGuide(key: string): GuideManifest | null {
  return GUIDE_MANIFESTS.find(g => g.key === key) ?? null
}

/** 纯函数：从 manifest 列表按 key 解析步骤；未找到返回 null（供组件与测试复用） */
export function resolveSteps(manifests: readonly GuideManifest[], key: string): GuideStep[] | null {
  return manifests.find(g => g.key === key)?.steps ?? null
}

/**
 * manifest 里的图片路径（public/onboarding/... 形式）→ 渲染层可直接引用的静态资源路径。
 * vite 会把 public/ 下文件原样复制到产物根目录，渲染层按「onboarding/...」相对路径引用
 * （与既有 platform-icons/xxx.png 范式一致）。
 */
export function toAssetSrc(image: string): string {
  return image.replace(/^public\//, '')
}
