import json
import os

cache = os.path.expandvars(r'%LOCALAPPDATA%\hermes\cache')
with open(os.path.join(cache, 'i18n_patch_all.json'), 'r', encoding='utf-8') as f:
    patch = json.load(f)

with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

anchor = "  '文件过大': 'File Too Large',\n}"
if anchor not in c:
    print('ANCHOR NOT FOUND')
else:
    lines = []
    for k, v in patch.items():
        if k == '中文':
            continue
        ke = k.replace('\\', '\\\\').replace("'", "\\'")
        ve = v.replace('\\', '\\\\').replace("'", "\\'")
        lines.append("  '%s': '%s'," % (ke, ve))
    insertion = '\n'.join(lines) + '\n'
    c = c.replace(anchor, "  '文件过大': 'File Too Large',\n" + insertion + '}')
    with open('src/renderer/i18n.tsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Inserted %d keys into enDict' % len(lines))
