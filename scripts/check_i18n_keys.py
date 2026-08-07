# -*- coding: utf-8 -*-
"""检查所有 t('中文') 调用是否在 i18n.tsx enDict 中有对应英文翻译"""
import os
import re

# 读取 enDict 的所有 key
with open('src/renderer/i18n.tsx', 'r', encoding='utf-8') as f:
    i18n_content = f.read()

# 提取 enDict 中的 key（在 '文件过大' 区域之前都是旧 key，之后是合并的）
# 简单方法：找所有行首带引号的 key
dict_keys = set(re.findall(r"^\s*'([^']+)':\s*'", i18n_content, re.MULTILINE))

missing = []
total = 0
for dirpath, dirnames, filenames in os.walk('src/renderer'):
    if 'node_modules' in dirpath:
        continue
    for fn in filenames:
        if not fn.endswith(('.tsx', '.ts')):
            continue
        if fn == 'i18n.tsx':
            continue
        p = os.path.join(dirpath, fn)
        with open(p, 'r', encoding='utf-8') as f:
            content = f.read()
        # 提取 t('...') 和 t("...")
        keys = re.findall(r"t\(\s*['\"]([^'\"]+)['\"]\s*\)", content)
        for k in keys:
            total += 1
            if k not in dict_keys:
                missing.append(f'{p}: {k}')

print(f'Total t() calls: {total}')
print(f'Missing translations: {len(missing)}')
for m in missing:
    print('  MISSING:', m)
