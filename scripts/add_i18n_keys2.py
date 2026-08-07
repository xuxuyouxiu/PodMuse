# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
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
