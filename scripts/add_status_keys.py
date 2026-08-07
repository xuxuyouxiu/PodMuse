# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
    '监听运行中': 'Monitoring',
    '监听未启动': 'Monitor Off',
    '飞书已连接': 'Feishu Connected',
    '飞书未连接': 'Feishu Disconnected',
    '30s 轮询 · Obsidian: 小宇宙播客': '30s polling · Obsidian: Podcasts',
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
