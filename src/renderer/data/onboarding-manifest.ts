/**
 * 图文说明书（onboarding guide）清单 —— renderer 侧纯静态数据，离线可用、随版本发布。
 *
 * 图片资源约定（docs/配置体系优化落地实现方案.md §1.2）：
 *   截图放 public/onboarding/<key>/n.png（1080 宽 PNG、红框/箭头标注、单张 < 200KB），
 *   平台页面改版时只换图、代码零改动。本批暂未提供真实截图，
 *   GuideCarousel 会在图片缺失或加载失败时优雅降级为占位卡（大号步骤序号 + 文案）。
 *
 * 双语约定：每组 title/titleEn、每步 caption/captionEn 成对提供；
 *   GuideCarousel 在 en 语言下展示英文，缺省回退中文。
 */

export interface GuideStep {
  /** 可选截图：相对项目根的 public/ 路径，如 public/onboarding/ai-key/1.png；缺省时组件显示占位卡 */
  image?: string
  /** 该步骤的操作说明（具体可执行，每步 ≤3 行，中文） */
  caption: string
  /** 该步骤的英文说明（en 语言下展示；缺省回退中文 caption） */
  captionEn?: string
}

export interface GuideManifest {
  /** 指南唯一标识（GuideCarousel 的 guideKey） */
  key: string
  /** 弹层标题（中文） */
  title: string
  /** 弹层标题英文（en 语言下展示；缺省回退中文 title） */
  titleEn?: string
  /** 有序步骤 */
  steps: GuideStep[]
  /** 「去操作」按钮的外链；缺省时不显示该按钮 */
  actionUrl?: string
}

export const GUIDE_MANIFESTS: readonly GuideManifest[] = [
  {
    key: 'ai-key',
    title: '申请 API Key',
    titleEn: 'Get an API Key',
    actionUrl: 'https://platform.deepseek.com/api_keys',
    steps: [
      {
        image: 'public/onboarding/ai-key/1.png',
        caption:
          '打开 DeepSeek 开放平台并登录（右上角「登录/注册」，支持手机号或微信）；OpenAI 等其他平台请前往各自控制台的「API Keys」页面。',
        captionEn:
          'Open the DeepSeek platform and sign in (top-right "Log In / Sign Up", phone or WeChat supported). For OpenAI or other providers, go to the "API Keys" page of their own console.',
      },
      {
        image: 'public/onboarding/ai-key/2.png',
        caption: '点击「创建 API Key」，按提示命名并完成创建。',
        captionEn: 'Click "Create API Key", name it as prompted, and finish creating it.',
      },
      {
        image: 'public/onboarding/ai-key/3.png',
        caption:
          '复制以 sk- 开头的密钥，回到 PodMuse 粘贴到上方「API Key」输入框，点「加载模型」验证是否可用。',
        captionEn:
          'Copy the key starting with sk-, paste it into the "API Key" field in PodMuse, then click "Load Models" to verify it works.',
      },
    ],
  },
  {
    key: 'feishu',
    title: '连接飞书（企业自建应用）',
    titleEn: 'Connect Feishu (Custom App)',
    actionUrl: 'https://open.feishu.cn/app',
    steps: [
      {
        image: 'public/onboarding/feishu/1.png',
        caption:
          '打开飞书开放平台并登录，进入「开发者后台」，点击「创建企业自建应用」，填写应用名称与描述。',
        captionEn:
          'Open the Feishu open platform and sign in. Go to "Developer Console", click "Create Custom App", and fill in the app name and description.',
      },
      {
        image: 'public/onboarding/feishu/2.png',
        caption:
          '进入应用「凭证与基础信息」页，复制 App ID；App Secret 点击「查看」后复制（请勿泄露给他人）。',
        captionEn:
          'Open the app "Credentials & Basic Info" page and copy the App ID; click "View" to reveal and copy the App Secret (never share it with anyone).',
      },
      {
        image: 'public/onboarding/feishu/3.png',
        caption: '在「添加应用能力」中开启「机器人」，然后创建版本并发布，应用才能被拉进群聊。',
        captionEn:
          'Enable the "Bot" capability under "Add Application Features", then create a version and publish it so the app can be added to group chats.',
      },
      {
        image: 'public/onboarding/feishu/4.png',
        caption:
          '回到飞书客户端，把应用机器人拉进目标群聊；在群「设置 → 群信息」复制群号（oc_ 开头）作为 Chat ID。',
        captionEn:
          'Back in the Feishu client, add the app bot to the target group chat; open the group "Settings → Group Info" and copy the chat id (starting with oc_) as the Chat ID.',
      },
    ],
  },
  {
    key: 'douyin',
    title: '连接抖音（扫码登录）',
    titleEn: 'Connect Douyin (QR Login)',
    steps: [
      {
        image: 'public/onboarding/douyin/1.png',
        caption: '点击「连接抖音」按钮，弹出抖音登录窗口。',
        captionEn: 'Click "Connect Douyin" to open the Douyin login window.',
      },
      {
        image: 'public/onboarding/douyin/2.png',
        caption: '用抖音 App 扫码登录，成功后窗口自动关闭并完成配置，登录状态仅保存在本机，全程无需手动复制 Cookie。',
        captionEn:
          'Scan the QR code with the Douyin app. On success the window closes automatically and the login is stored only on this device — no need to copy cookies manually.',
      },
    ],
  },
  {
    key: 'notion',
    title: '连接 Notion（Connection 令牌）',
    titleEn: 'Connect Notion (Connection Token)',
    actionUrl: 'https://www.notion.so/my-integrations',
    steps: [
      {
        image: 'public/onboarding/notion/1.png',
        caption:
          '打开 Notion 并进入「设置 → 连接」（Connections，原「我的集成/我的连接」），点击「新建连接」；若已是新版界面，请直接点「连接」入口创建。',
        captionEn:
          'Open Notion and go to "Settings → Connections" (formerly "My integrations"), then click "New connection"; on the new UI just click the "Connections" entry to create one.',
      },
      {
        image: 'public/onboarding/notion/2.png',
        caption:
          '创建完成后复制连接令牌：新版以 ntn_ 开头（旧版为 secret_）。令牌只显示一次，请立即复制并粘贴到 PodMuse 的「Notion Token」。',
        captionEn:
          'After creation, copy the connection token: it starts with ntn_ on the new UI (secret_ on the legacy one). The token is shown only once — copy it right away and paste it into the Notion Token field in PodMuse.',
      },
      {
        image: 'public/onboarding/notion/3.png',
        caption:
          '关键：数据库页在工作区左侧边栏（表格/看板页，如 Weekly To-do List；没有就输入 /table 新建）。打开它 →「…→连接→连接到」选刚建的连接 → 复制 URL 的 32 位 id。连接须授权到该页面，数据库才会出现。',
        captionEn:
          'Key: the database page lives in your workspace sidebar (a table/board page like Weekly To-do List; to create one, type /table in any page and hit Enter, then name it e.g. "Podcast Library"), not in the developers tool. Open that database page, click "… → Connections" → "Connect to" and pick the connection you just created; then copy the 32-character database id from the page URL. The connection must be granted access to the page before your database appears in the list.',
      },
    ],
  },
  {
    key: 'whisper',
    title: '安装语音识别引擎',
    titleEn: 'Install Speech Recognition Engine',
    steps: [
      {
        image: 'public/onboarding/whisper/1.png',
        caption:
          '点击「自动检测引擎」定位已安装的引擎；若未安装，点「一键安装 Faster-Whisper-XXL」（约 1.4 GB）或「GitHub 下载」手动安装。默认模型 large-v3-turbo（约 6GB）首次使用自动下载。',
        captionEn:
          'Click "Auto-detect Engine" to locate an installed engine; if none is installed, click "Install Faster-Whisper-XXL" (~1.4 GB) or download it manually from GitHub. The default large-v3-turbo model (~6 GB) downloads automatically on first use.',
      },
    ],
  },
  {
    key: 'dirs',
    title: '选择笔记目录',
    titleEn: 'Choose Notes Folder',
    steps: [
      {
        image: 'public/onboarding/dirs/1.png',
        caption:
          '不选择任何目录时，PodMuse 会在系统文档目录自动创建「PodMuse笔记」文件夹；也可以点「浏览」选择已有文件夹，若其中存在 .obsidian 文件夹会自动识别为 Obsidian Vault 并复用。',
        captionEn:
          'If no folder is chosen, PodMuse automatically creates a "PodMuse笔记" folder in your system Documents directory. You can also click "Browse" to choose an existing folder; a .obsidian folder inside it will be detected and reused as an Obsidian vault.',
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
