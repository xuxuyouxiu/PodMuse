# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
    '必填：选择或自动检测 whisper 引擎文件': 'Required: select or auto-detect the whisper engine file',
    'Whisper 引擎是本地语音转文字的必需组件，可从 GitHub 下载': 'The Whisper engine is required for local speech-to-text. Download it from GitHub',
    'GitHub 下载': 'Download from GitHub',
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
