# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
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
