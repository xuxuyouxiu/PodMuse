# 版本号管理指南

## 语义化版本号

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范：

```
主版本号.次版本号.修订号 (MAJOR.MINOR.PATCH)
```

### 版本号含义

- **主版本号 (MAJOR)**：当你做了不兼容的 API 修改
- **次版本号 (MINOR)**：当你做了向下兼容的功能性新增
- **修订号 (PATCH)**：当你做了向下兼容的问题修正

### 示例

- `1.0.0` -> `1.0.1`：修复了一个 Bug
- `1.0.0` -> `1.1.0`：添加了新功能
- `1.0.0` -> `2.0.0`：重大更新，可能不兼容旧版本

## 更新版本号

### 方法一：使用脚本（推荐）

```powershell
# 修订号+1 (Bug修复)
.\scripts\update-version.ps1 -Patch

# 次版本号+1 (新功能)
.\scripts\update-version.ps1 -Minor

# 主版本号+1 (重大更新)
.\scripts\update-version.ps1 -Major

# 指定具体版本号
.\scripts\update-version.ps1 -Version "1.2.3"
```

### 方法二：手动更新

1. 编辑 `package.json`，修改 `version` 字段
2. 运行 `npm run build:setup` 验证构建
3. 更新 `CHANGELOG.md`
4. 提交代码并创建标签

## 版本更新工作流程

### 1. 更新版本号

```powershell
# 示例：发布新功能
.\scripts\update-version.ps1 -Minor
```

### 2. 更新 CHANGELOG.md

在 `CHANGELOG.md` 中添加新版本的更新内容：

```markdown
## [1.1.0] - 2026-05-31

### 新增
- 添加了搜索功能
- 添加了系统通知功能

### 修复
- 修复了 DeepSeek API 调用失败无重试的问题
- 修复了删除任务无确认的问题

### 变更
- 优化了代码结构
```

### 3. 构建和测试

```powershell
npm run build:setup
```

### 4. 提交代码

```powershell
git add .
git commit -m "v1.1.0: 添加搜索功能和通知功能"
git tag v1.1.0
git push origin main --tags
```

## 版本号存储位置

版本号在以下位置定义和使用：

1. **`package.json`**：主版本号定义
2. **`electron-builder.yml`**：使用 `${version}` 变量
3. **安装程序文件名**：`播客笔记助手-Setup-${version}.exe`
4. **应用界面**：Header 栏显示当前版本号

## 注意事项

1. **版本号只能递增**：不能回退版本号
2. **一致性**：确保所有位置的版本号一致
3. **及时更新**：每次发布新版本都要更新版本号
4. **记录变更**：在 CHANGELOG.md 中详细记录变更内容

## 版本发布检查清单

- [ ] 更新版本号（使用脚本或手动）
- [ ] 更新 CHANGELOG.md
- [ ] 运行测试（如果有）
- [ ] 构建项目：`npm run build:setup`
- [ ] 测试安装程序
- [ ] 提交代码：`git commit -m "vx.y.z"`
- [ ] 创建标签：`git tag vx.y.z`
- [ ] 推送到远程：`git push origin main --tags`