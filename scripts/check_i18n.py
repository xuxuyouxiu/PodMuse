import os
import re

# 扫描 renderer 下所有 tsx/ts，找非注释、非 t() 参数、非日志的中文字符串
root = 'src/renderer'
issues = []
total_cjk_lines = 0

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if not (fn.endswith('.tsx') or fn.endswith('.ts')):
            continue
        if fn == 'i18n.tsx':
            continue
        p = os.path.join(dirpath, fn)
        with open(p, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        for i, line in enumerate(lines, 1):
            if not re.search(r'[\u4e00-\u9fa5]', line):
                continue
            total_cjk_lines += 1
            stripped = line.strip()
            # 允许：纯注释、console 日志、t('中文') 或 t("中文") 调用、字符串常量定义（'中文' 作为 key/值）
            if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
                continue
            if re.match(r'^(console\.(log|error|warn)|log\()', stripped):
                continue
            # 检查是否所有中文都在 t('...') 或 "..." 字符串或注释尾部
            # 移除 t('...') 和 t("...") 和 {'...'} 中的内容
            no_t = re.sub(r"t\(\s*['\"][^'\"]*['\"]\s*\)", '', line)
            no_t = re.sub(r"['\"][^'\"]*[\u4e00-\u9fa5][^'\"]*['\"]", '', no_t)
            # 移除字符串定义（const x = '中文' 或 '中文': 'English' 或 '中文',）
            no_t = re.sub(r"['\"][^'\"]*['\"]\s*[,:\)]", '', no_t)
            # 移除尾部注释
            no_t = re.sub(r'//.*$', '', no_t)
            if re.search(r'[\u4e00-\u9fa5]', no_t):
                issues.append(f'{p}:{i}: {stripped[:100]}')

print(f'CJK lines total: {total_cjk_lines}')
print(f'Potential issues: {len(issues)}')
for it in issues:
    print(' ', it)
