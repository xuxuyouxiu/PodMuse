# 固定目录覆盖测试流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为播客笔记助手新增固定目录测试更新流，让后续测试始终覆盖 `dist-exe\win-unpacked` 而不是创建新打包目录。

**Architecture:** 通过两个 PowerShell 脚本拆分“临时构建”和“固定目录部署”职责，`package.json` 只负责提供稳定入口。用一个静态源码测试文件约束命令和脚本关键行为，避免后续命令回退。

**Tech Stack:** Node.js scripts、PowerShell 5、electron-builder、Vite、Node test

---

## 文件结构

- Create: `g:\Podcast_Notes\scripts\build-test-package.ps1`
- Create: `g:\Podcast_Notes\scripts\deploy-test-build.ps1`
- Create: `g:\Podcast_Notes\tests\refresh-test-flow.test.mjs`
- Modify: `g:\Podcast_Notes\package.json`

### Task 1: 写失败测试锁定命令入口

**Files:**
- Create: `g:\Podcast_Notes\tests\refresh-test-flow.test.mjs`
- Modify: `g:\Podcast_Notes\package.json`

- [ ] **Step 1: 写失败测试**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 补 `package.json` 脚本**
- [ ] **Step 4: 运行测试确认通过**

### Task 2: 实现临时构建脚本

**Files:**
- Create: `g:\Podcast_Notes\scripts\build-test-package.ps1`
- Test: `g:\Podcast_Notes\tests\refresh-test-flow.test.mjs`

- [ ] **Step 1: 扩展失败测试，约束 `dist-exe-temp` 和 `--dir`**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 实现最小构建脚本**
- [ ] **Step 4: 运行测试确认通过**

### Task 3: 实现固定目录部署脚本

**Files:**
- Create: `g:\Podcast_Notes\scripts\deploy-test-build.ps1`
- Test: `g:\Podcast_Notes\tests\refresh-test-flow.test.mjs`

- [ ] **Step 1: 扩展失败测试，约束进程结束与覆盖目标**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 实现最小部署脚本**
- [ ] **Step 4: 运行测试确认通过**

### Task 4: 端到端验证

**Files:**
- Modify: `g:\Podcast_Notes\package.json`
- Test: `g:\Podcast_Notes\tests\refresh-test-flow.test.mjs`

- [ ] **Step 1: 运行 `node --test tests/refresh-test-flow.test.mjs`**
- [ ] **Step 2: 运行 `npm run refresh:test`**
- [ ] **Step 3: 确认 `dist-exe\\win-unpacked` 被刷新**

## 自检

- 规格覆盖：命令入口、临时目录、固定目录覆盖、结束相关进程都已覆盖
- 占位检查：无 TBD/TODO
- 类型一致性：统一使用 `dist-exe-temp` 和 `dist-exe\\win-unpacked`
