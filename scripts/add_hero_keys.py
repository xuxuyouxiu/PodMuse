# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
    '早上好': 'Good morning',
    '下午好': 'Good afternoon',
    '晚上好': 'Good evening',
    '粘贴链接，AI 自动转写并生成结构化笔记': 'Paste a link, AI transcribes and generates structured notes automatically',
    '今日完成': 'Done Today',
    '累计处理': 'Total Processed',
    '打开 Obsidian 库': 'Open Obsidian Vault',
}

anchor = "  '文件过大': 'File Too Large',\n"
lines = []
for k, v in new_keys.items():
    ke = k.replace('\\', '\\\\').replace("'", "\\'")
    ve = v.replace('\\', '\\\\').replace("'", "\\'")
    lines.append("  '%s': '%s'," % (ke, ve))
c = c.replace(anchor, anchor + '\n'.join(lines) + '\n')
with open('src/renderer/i18n.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Added', len(lines), 'keys')
