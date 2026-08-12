# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
    '自动检测引擎': 'Auto Detect Engine',
    '自动检测中…': 'Detecting…',
    '已自动检测并填入路径': 'Detected and filled automatically',
    '未找到 Whisper 引擎，请手动选择或安装 faster-whisper-xxl': 'Whisper engine not found. Select it manually or install faster-whisper-xxl',
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
