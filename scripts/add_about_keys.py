# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
    '把播客变成知识库': 'Turn podcasts into a knowledge base',
    '粘贴任意播客/视频链接，自动完成提取、下载、转写、校对和笔记整理，并写入 Obsidian 知识库。': 'Paste any podcast/video link. Extraction, download, transcription, correction and note generation happen automatically, then notes are written into your Obsidian vault.',
    '多平台支持：小宇宙、B站、YouTube、喜马拉雅、Apple Podcasts、抖音': 'Multi-platform: Xiaoyuzhou, Bilibili, YouTube, Ximalaya, Apple Podcasts, Douyin',
    'AI 自动转写：Whisper 本地语音识别，无需上传云端': 'AI transcription: local Whisper speech recognition, no cloud upload',
    'AI 笔记生成：核心观点、关键对话、术语词典、金句摘录': 'AI notes: key points, key quotes, glossary, golden quotes',
    '自动实体卡片与双向链接，构建 Obsidian 知识网络': 'Auto entity cards and backlinks build your Obsidian knowledge graph',
    '抖音': 'Douyin',
}

anchor = "  '文件过大': 'File Too Large',\n}"
lines = []
for k, v in new_keys.items():
    ke = k.replace('\\', '\\\\').replace("'", "\\'")
    ve = v.replace('\\', '\\\\').replace("'", "\\'")
    lines.append("  '%s': '%s'," % (ke, ve))
c = c.replace(anchor, "  '文件过大': 'File Too Large',\n" + '\n'.join(lines) + '\n}')
with open('src/renderer/i18n.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Added', len(lines), 'keys')
