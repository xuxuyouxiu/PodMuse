# -*- coding: utf-8 -*-
"""把缺失的翻译 key 一次性合并进 i18n.tsx（锚点：'文件过大' 行）"""
import os
import re

with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 现有字典 key
dict_keys = set(re.findall(r"^\s*'([^']+)':\s*'", c, re.MULTILINE))

# 所有 t('...') 调用
missing = {}
for dirpath, dirnames, filenames in os.walk('src/renderer'):
    if 'node_modules' in dirpath:
        continue
    for fn in filenames:
        if not fn.endswith(('.tsx', '.ts')) or fn == 'i18n.tsx':
            continue
        p = os.path.join(dirpath, fn)
        with open(p, 'r', encoding='utf-8') as f:
            content = f.read()
        for k in re.findall(r"t\(\s*['\"]([^'\"]+)['\"]\s*\)", content):
            if k not in dict_keys and k not in missing:
                missing[k] = None

# 手动补充的英文翻译（来自之前失败的 add_* 脚本）
translations = {
    '把播客变成知识库': 'Turn podcasts into a knowledge base',
    '粘贴任意播客/视频链接，自动完成提取、下载、转写、校对和笔记整理，并写入 Obsidian 知识库。': 'Paste any podcast/video link. Extraction, download, transcription, correction and note generation happen automatically, then notes are written into your Obsidian vault.',
    '多平台支持：小宇宙、B站、YouTube、喜马拉雅、Apple Podcasts、抖音': 'Multi-platform: Xiaoyuzhou, Bilibili, YouTube, Ximalaya, Apple Podcasts, Douyin',
    'AI 自动转写：Whisper 本地语音识别，无需上传云端': 'AI transcription: local Whisper speech recognition, no cloud upload',
    'AI 笔记生成：核心观点、关键对话、术语词典、金句摘录': 'AI notes: key points, key quotes, glossary, golden quotes',
    '自动实体卡片与双向链接，构建 Obsidian 知识网络': 'Auto entity cards and backlinks build your Obsidian knowledge graph',
    '抖音': 'Douyin',
    '飞书': 'Feishu',
    '项目地址': 'Repository',
    '问题反馈': 'Feedback',
    '提交 Issue': 'Submit Issue',
    '许可证': 'License',
    '活跃任务': 'Active Tasks',
    '暂无活跃任务': 'No active tasks',
    '新发起的任务会显示在这里': 'New tasks will appear here',
    '停止中...': 'Stopping...',
    '停止': 'Stop',
    '剩余': 'remaining',
    '个文件': 'files',
    '个链接': 'links',
    '确认处理': 'Process',
    '任务将按顺序逐个处理，单个失败不影响后续任务': 'Tasks are processed one by one; a failure does not affect the rest',
    '开始批量处理': 'Start Batch',
    '打开': 'Open',
    '个任务': 'tasks',
    '耗时': 'took',
    '分钟': 'min',
    '共': 'Total',
    '成功': 'succeeded',
    '跳过': 'skipped',
    '成功率': 'success rate',
    '状态': 'Status',
    '标题': 'Title',
    '操作': 'Actions',
    '完成': 'Done',
    '重试全部失败': 'Retry All Failed',
    '处理报告': 'Batch Report',
    '全部处理完成': 'All done',
    '处理完成': 'Completed',
    '已导出到 Markdown': 'Exported to Markdown',
    '已导出到 Logseq': 'Exported to Logseq',
    '已导出到 Notion': 'Exported to Notion',
    '导出失败': 'Export failed',
    '（页面已存在）': ' (page already exists)',
    '导出到 Logseq 目录': 'Export to Logseq folder',
    '未配置 Logseq 目录，请在设置中配置': 'Logseq folder not configured. Set it in Settings',
    '未配置 Notion 集成，请在设置中配置': 'Notion integration not configured. Set it in Settings',
    '上传到 Notion database': 'Upload to Notion database',
    '未配置': 'Not configured',
    '导出到其他平台': 'Export to other platforms',
    '导出中...': 'Exporting...',
    '导出': 'Export',
    '没有匹配的命令': 'No matching commands',
    '查看支持的链接格式': 'View supported link formats',
    '支持的链接格式': 'Supported Link Formats',
    '直链指任何能直接下载到音频/视频文件的公开 URL，如播客 RSS': 'A direct link is any public URL that downloads an audio/video file directly, e.g. a podcast RSS feed',
    '支持小宇宙、B 站、YouTube、喜马拉雅、Apple Podcasts 及直接音频链接，按 Enter 发起。': 'Supports Xiaoyuzhou, Bilibili, YouTube, Ximalaya, Apple Podcasts and direct audio links. Press Enter to start.',
    '支持小宇宙、B 站、YouTube、喜马拉雅、Apple Podcasts 及直接音频链接': 'Supports Xiaoyuzhou, Bilibili, YouTube, Ximalaya, Apple Podcasts and direct audio links',
    '不支持的文件格式': 'Unsupported file format',
    '仅允许': 'only allowed',
    '无法获取文件路径，请重试': 'Could not get file path, please try again',
    '释放以添加文件': 'Release to add files',
    '拖拽音视频文件到此处': 'Drop audio/video files here',
    '支持': 'Supports',
    '格式': 'formats',
    '浏览文件': 'Browse Files',
    '飞书已连接': 'Feishu Connected',
    '飞书未连接': 'Feishu Disconnected',
    '监听运行中': 'Monitoring',
    '监听未启动': 'Monitor Off',
    '30s 轮询 · Obsidian: 小宇宙播客': '30s polling · Obsidian: Podcasts',
    '小宇宙播客': 'Xiaoyuzhou podcast',
    '下载音频': 'Download audio',
    'Whisper 语音转写': 'Whisper transcription',
    'DeepSeek 修正专有名词': 'DeepSeek name correction',
    'AI 提炼笔记': 'AI note generation',
    '该播客已处理过，如需重新处理请从历史记录点击"重新处理"': 'This podcast was already processed. To reprocess, click "Reprocess" in history',
    '批量已暂停': 'Batch Paused',
    '批量处理中': 'Batch Processing',
    '待命中': 'Idle',
    'AI 播客工作区': 'AI Podcast Workspace',
    '欢迎回来': 'Welcome back',
    '当前节目': 'Current episode',
    '粘贴播客、视频或音频链接，应用会依次完成提取、下载、转写、校对和笔记整理。': 'Paste a podcast, video or audio link. The app will extract, download, transcribe, correct and organize notes automatically.',
    '上一次任务': 'Last task',
    '重试上次任务': 'Retry last task',
    '上次': 'Last',
    '个任务全部失败，是否查看并重试？': ' tasks failed. View and retry?',
    '历史记录': 'History',
    '最近处理完成或停止的任务': 'Recently completed or stopped tasks',
    '已结束的任务会归档到这里': 'Finished tasks are archived here',
    '恢复': 'Resume',
    '流程面板': 'Workflow',
    '当前处理阶段': 'Current Stage',
    '5 个步骤': '5 steps',
    '步骤': 'Step',
    '笔记已保存到 Obsidian': 'Note saved to Obsidian',
    '可在 Obsidian → 小宇宙播客 中查看': 'View in Obsidian → Podcasts',
    '处理已停止': 'Processing stopped',
    '可在右侧活跃任务中重新处理': 'Reprocess it in the active tasks panel on the right',
    '处理失败': 'Processing failed',
    '找到': 'Found',
    '个标准模型，本地已下载': 'standard models, downloaded locally',
    '个': '',
    '扫描失败': 'Scan failed',
    '清理失败': 'Cleanup failed',
    '临时文件已清理': 'Temp files cleaned',
    '已加载': 'Loaded',
    '个模型': 'models',
    '加载失败': 'Load failed',
    '测试失败': 'Test failed',
    '已连接': 'Connected',
    '飞书鉴权失败，请检查 App ID 和 App Secret': 'Feishu auth failed. Check your App ID and App Secret',
    '凭据有效，群聊': 'Credentials valid, chat',
    '可访问': 'is accessible',
    '凭据有效，但 Chat ID 无效或应用未加入该群聊（需在飞书开放平台给应用添加 im:chat 权限）': 'Credentials valid, but the Chat ID is invalid or the app is not in that chat (add im:chat permission in the Feishu open platform)',
    '飞书凭据验证成功（未填写 Chat ID，跳过群聊验证）': 'Feishu credentials valid (Chat ID not set, chat check skipped)',
    '测试中…': 'Testing…',
}

# 生成插入内容
anchor = "  '文件过大': 'File Too Large',\n"
lines = []
for k in sorted(missing):
    v = translations.get(k, '')
    if v is None or v == '':
        # 没有翻译的 key：跳过或标记（'个' 等空翻译也加入）
        if k == '个':
            lines.append("  '个': '',")
        else:
            print('NO TRANSLATION for:', k)
        continue
    ke = k.replace('\\', '\\\\').replace("'", "\\'")
    ve = v.replace('\\', '\\\\').replace("'", "\\'")
    lines.append("  '%s': '%s'," % (ke, ve))

if lines:
    c = c.replace(anchor, anchor + '\n'.join(lines) + '\n')
    with open('src/renderer/i18n.tsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Inserted', len(lines), 'keys')
else:
    print('Nothing to insert')
