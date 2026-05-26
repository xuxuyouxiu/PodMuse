# Task Architecture Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `recentTasks` list into two distinct physical arrays in the state (`activeTasks` and `recentTasks`), implement cross-list migration when tasks complete/fail, and add a graceful fallback for Feishu API polling failures.

**Architecture:** We will update `FeishuState` in `types.ts` to include `activeTasks`. We will then refactor the functions in `recent-task-state.ts` to push new/running tasks into `activeTasks`, and upon completion or failure, remove them from `activeTasks` and unshift them into `recentTasks`. We will also add a `try/catch` wrapper around the Feishu `listMessages` call in `message-poller.ts` to emit a specific fallback log message on failure.

**Tech Stack:** TypeScript, Node.js built-in test runner

---

### Task 1: Update Data Types and State Loader

**Files:**
- Modify: `g:\Podcast_Notes\src\shared\types.ts`
- Modify: `g:\Podcast_Notes\src\main\config.ts`
- Modify: `g:\Podcast_Notes\tests\task-architecture-split.test.mjs` (Create this file)

- [ ] **Step 1: Write the failing test**

Create `g:\Podcast_Notes\tests\task-architecture-split.test.mjs` and add:
```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('FeishuState includes activeTasks array', () => {
  const source = fs.readFileSync(new URL('../src/shared/types.ts', import.meta.url), 'utf8')
  assert.match(source, /activeTasks:\s*RecentTaskState\[\]/)
})

test('loadState initializes activeTasks', () => {
  const source = fs.readFileSync(new URL('../src/main/config.ts', import.meta.url), 'utf8')
  assert.match(source, /activeTasks:\s*data\.activeTasks\s*\|\|\s*\[\]/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/task-architecture-split.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement minimal code**

In `src/shared/types.ts`, add `activeTasks: RecentTaskState[]` to the `FeishuState` interface.

In `src/main/config.ts`, update `loadState()` to include `activeTasks: data.activeTasks || [],` in both the parsed return object and the fallback return object.

- [ ] **Step 4: Verify test passes**

Run the test again. Expected: PASS.

---

### Task 2: Implement Task Migration Logic

**Files:**
- Modify: `g:\Podcast_Notes\src\main\recent-task-state.ts`

- [ ] **Step 1: Write the failing test**

Append to `g:\Podcast_Notes\tests\task-architecture-split.test.mjs`:
```javascript
test('task state functions migrate tasks between active and recent lists', () => {
  const source = fs.readFileSync(new URL('../src/main/recent-task-state.ts', import.meta.url), 'utf8')
  
  // startRecentTask should put task in activeTasks
  assert.match(source, /activeTasks:\s*normalizeRecentTasks\(\[\s*nextTask/)
  
  // completeRecentTask should remove from activeTasks and put in recentTasks
  assert.match(source, /activeTasks:\s*state\.activeTasks\.filter/)
  assert.match(source, /recentTasks:\s*normalizeRecentTasks\(\[\s*\{\s*\.\.\.activeTask,\s*status:\s*'completed'/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Implement minimal code**

In `src/main/recent-task-state.ts`:
1.  Update `startRecentTask`: It should find the task in *both* lists. It creates the `nextTask`. It should return a state where `nextTask` is unshifted into `activeTasks` (filtering it out if it was already there), and filter it out from `recentTasks` (in case a completed task is being replayed).
2.  Update `withRecentStatus` (used by fail and stop): It should find the task in `activeTasks`. If found, remove it from `activeTasks`, update its status, and unshift it into `recentTasks`.
3.  Update `completeRecentTask`: Similar to `withRecentStatus`. Find the task in `activeTasks` (using `findTaskByIdentity` looking at both lists, but specifically moving it from active). If it's in `activeTasks`, remove it, update it to `completed` with `filename`, and unshift to `recentTasks`.
4.  Update `findRecentTask` and `findTaskByIdentity` to search `activeTasks` first, then `recentTasks`.
5.  Update `removeRecentTask` to filter from both lists.

- [ ] **Step 4: Verify test passes**

Run the test again. Expected: PASS.

---

### Task 3: Implement Feishu Polling Fallback

**Files:**
- Modify: `g:\Podcast_Notes\src\main\message-poller.ts`

- [ ] **Step 1: Write the failing test**

Append to `g:\Podcast_Notes\tests\task-architecture-split.test.mjs`:
```javascript
test('message poller catches listMessages errors and logs fallback message', () => {
  const source = fs.readFileSync(new URL('../src/main/message-poller.ts', import.meta.url), 'utf8')
  assert.match(source, /try\s*\{\s*const\s*messages\s*=\s*await\s*this\.client\.listMessages/)
  assert.match(source, /catch\s*\(\w+\)\s*\{\s*this\.logFunc\('⚠️ 飞书任务同步失败，正在使用本地缓存'\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Implement minimal code**

In `src/main/message-poller.ts` inside the `tick` method, locate the `const messages = await this.client.listMessages(this.chatId)` call. Wrap it in a `try/catch` block. In the catch block, call `this.logFunc('⚠️ 飞书任务同步失败，正在使用本地缓存')` and then `return` so the tick gracefully exits without crashing the poller.

- [ ] **Step 4: Verify test passes**

Run the test again. Expected: PASS.
