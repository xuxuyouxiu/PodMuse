# 固定目录覆盖测试流设计

日期：2026-05-26

## 目标

- 后续测试不再依赖安装包反复安装/卸载。
- 固定使用 `g:\Podcast_Notes\dist-exe\win-unpacked` 作为唯一测试运行目录。
- 每次更新程序时，先构建到临时目录，再覆盖回固定目录。
- 不自动重开程序，覆盖完成后由用户手动重新打开。

## 约束

- 不改业务逻辑和 UI。
- 不改变正式安装包的现有生成能力。
- 只新增测试构建和固定目录部署脚本。
- 运行中的程序不能直接原地覆盖，必须先结束相关进程。

## 方案

新增三条命令：

- `npm run build:test`
  - 先执行 `vite-build`
  - 再用 `electron-builder --dir` 生成临时解包目录
  - 临时输出目录固定为 `dist-exe-temp`

- `npm run deploy:test`
  - 检查并结束 `dist-exe` / `dist-exe-temp` / 项目目录下相关 Electron 进程
  - 将 `dist-exe-temp\win-unpacked` 覆盖到 `dist-exe\win-unpacked`
  - 不生成新目录名，不自动打开程序

- `npm run refresh:test`
  - 顺序执行 `build:test` 与 `deploy:test`

## 文件

- 新增 `g:\Podcast_Notes\scripts\build-test-package.ps1`
  - 构建临时测试包

- 新增 `g:\Podcast_Notes\scripts\deploy-test-build.ps1`
  - 结束进程并覆盖固定目录

- 修改 `g:\Podcast_Notes\package.json`
  - 增加上述三个命令

- 新增 `g:\Podcast_Notes\tests\refresh-test-flow.test.mjs`
  - 对命令入口和脚本关键内容做静态断言

## 部署规则

- 目标目录固定：
  - `g:\Podcast_Notes\dist-exe\win-unpacked`

- 临时目录固定：
  - `g:\Podcast_Notes\dist-exe-temp`

- 覆盖前先尝试结束下列相关进程：
  - 可执行路径位于项目目录中的 `播客笔记助手.exe`
  - `electron.exe`
  - `crashpad_handler.exe`

- 覆盖时保留 `dist-exe` 根目录本身，只替换其中的 `win-unpacked`

## 成功标准

- 可以通过 `npm run refresh:test` 在固定目录刷新测试程序
- 刷新后运行路径始终不变
- 不再需要构建出 `dist-exe-debug-v2/v3/v4` 这类临时目录
- 构建和部署脚本可重复执行
