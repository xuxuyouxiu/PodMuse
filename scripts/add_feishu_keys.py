# -*- coding: utf-8 -*-
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

new_keys = {
    '飞书鉴权失败，请检查 App ID 和 App Secret': 'Feishu auth failed. Check your App ID and App Secret',
    '凭据有效，群聊': 'Credentials valid, chat',
    '可访问': 'is accessible',
    '凭据有效，但 Chat ID 无效或应用未加入该群聊（需在飞书开放平台给应用添加 im:chat 权限）': 'Credentials valid, but the Chat ID is invalid or the app is not in that chat (add im:chat permission in the Feishu open platform)',
    '飞书凭据验证成功（未填写 Chat ID，跳过群聊验证）': 'Feishu credentials valid (Chat ID not set, chat check skipped)',
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
