# onboarding 截图资源目录

图文说明书（GuideCarousel）的截图按「指南 key / 步骤序号.png」组织：

\`\`\`
public/onboarding/
├── ai-key/        1.png 2.png 3.png    # DeepSeek/OpenAI 等平台申请 API Key（通用模板可复用）
├── feishu/        1.png 2.png 3.png 4.png  # 建应用 → App ID/Secret → 机器人 → 群聊 Chat ID
├── douyin/        1.png 2.png          # 登录窗扫码登录 + 登录成功状态
├── notion/        1.png 2.png 3.png    # 建集成 → 复制 secret → 页面 Connections 邀请 + 复制 database id
├── whisper/       1.png                # 一键安装与默认模型 large-v3-turbo（约 6GB）说明
└── dirs/          1.png                # 默认目录 / 自定义选择 / 自动识别 Obsidian
\`\`\`

图片制作约定（docs/配置体系优化落地实现方案.md §1.2）：
- 1080 宽 PNG、红框/箭头标注、单张 < 200KB（打包体积友好）
- 平台页面改版时只换图，代码零改动（manifest 路径见 src/renderer/data/onboarding-manifest.ts）

现状（2026-08-21）：ai-key / feishu / douyin / notion 第 1 步已提供真实截图；
whisper、dirs 与 notion 第 2、3 步为纯文字说明（无截图，GuideCarousel 显示占位卡）。
敏感信息（API Key、分享链接 token 等）已打码。
