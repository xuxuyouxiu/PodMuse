# UI Task Panels Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the UI's single task panel into two distinct vertical panels (`ActiveTasksPanel` and `RecentTasksPanel`) within the `workspace-aside` container, reflecting the newly separated backend data architecture.

**Architecture:** 
1. Update `electronAPI` and IPC handlers to return both `activeTasks` and `recentTasks` separately (or as a combined state object).
2. Refactor the existing `RecentTasksSidebar.tsx` into two smaller, focused components: `ActiveTasksPanel.tsx` and `RecentTasksPanel.tsx`.
3. Update `App.tsx` to fetch the split data and render both panels vertically inside the `workspace-aside` container.
4. Add CSS to ensure both panels share the vertical space evenly (or scroll properly) and display their empty states when no data exists.

**Tech Stack:** React, TypeScript, CSS, Node.js built-in test runner

---

### Task 1: Update IPC Interface and Backend Handlers

**Files:**
- Modify: `g:\Podcast_Notes\src\main\index.ts`
- Modify: `g:\Podcast_Notes\src\shared\types.ts`
- Modify: `g:\Podcast_Notes\src\renderer\env.d.ts`
- Modify: `g:\Podcast_Notes\tests\task-architecture-ui-split.test.mjs` (Create this file)

- [ ] **Step 1: Write the failing test**

Create `g:\Podcast_Notes\tests\task-architecture-ui-split.test.mjs`:
```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('IPC handlers expose getTasks object with both lists', () => {
  const source = fs.readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  assert.match(source, /ipcMain\.handle\('task:getAll',/)
  assert.match(source, /activeTasks:.*recentTasks:/)
})

test('Renderer env declares getTasks', () => {
  const source = fs.readFileSync(new URL('../src/renderer/env.d.ts', import.meta.url), 'utf8')
  assert.match(source, /getTasks:\s*\(\)\s*=>\s*Promise<\{/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/task-architecture-ui-split.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement minimal code**

In `src/shared/types.ts`:
Add a new interface for the payload:
```typescript
export interface TaskListsPayload {
  activeTasks: RecentTaskState[]
  recentTasks: RecentTaskState[]
}
```

In `src/main/index.ts`:
Add the new IPC handler around line 74:
```typescript
  ipcMain.handle('task:getAll', () => {
    const state = loadState()
    return {
      activeTasks: state.activeTasks,
      recentTasks: state.recentTasks
    }
  })
```
*(Note: We keep the old `task:getRecent` for backward compatibility temporarily, or update it directly if safe. Let's add the new `task:getAll` to be clean).*

In `src/renderer/env.d.ts`:
Update the `electronAPI` interface:
```typescript
      getTasks: () => Promise<{ activeTasks: any[], recentTasks: any[] }>
```

- [ ] **Step 4: Verify test passes**

Run the test again. Expected: PASS.

---

### Task 2: Create Split UI Components

**Files:**
- Create: `g:\Podcast_Notes\src\renderer\components\ActiveTasksPanel.tsx`
- Create: `g:\Podcast_Notes\src\renderer\components\RecentTasksPanel.tsx`

- [ ] **Step 1: Write the failing test**

Append to `g:\Podcast_Notes\tests\task-architecture-ui-split.test.mjs`:
```javascript
test('New panel components exist and use correct titles', () => {
  const activeSource = fs.readFileSync(new URL('../src/renderer/components/ActiveTasksPanel.tsx', import.meta.url), 'utf8')
  const recentSource = fs.readFileSync(new URL('../src/renderer/components/RecentTasksPanel.tsx', import.meta.url), 'utf8')
  
  assert.match(activeSource, /活跃任务/)
  assert.match(recentSource, /历史记录/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL (files do not exist).

- [ ] **Step 3: Implement minimal code**

Create `src/renderer/components/ActiveTasksPanel.tsx` by copying the structure of `RecentTasksSidebar.tsx` but simplified for active tasks:
```tsx
import { RecentTaskState } from '../../../shared/types'

interface Props {
  tasks: RecentTaskState[]
  onCancel: (taskId: string) => void
}

const STATUS_META: Record<RecentTaskState['status'], { label: string }> = {
  running: { label: '处理中' },
  stopped: { label: '已停止' },
  error: { label: '失败' },
  completed: { label: '已完成' },
}

export default function ActiveTasksPanel({ tasks, onCancel }: Props) {
  return (
    <aside className="task-panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="task-panel-header">
        <div>
          <div className="task-panel-title">活跃任务</div>
          <div className="task-panel-subtitle">正在处理或排队中的任务</div>
        </div>
        <div className="task-panel-count">{tasks.length}</div>
      </div>

      <div className="task-panel-list">
        {tasks.length === 0 && (
          <div className="task-panel-empty">
            <div className="task-panel-empty-icon">⚡</div>
            <div className="task-panel-empty-title">暂无活跃任务</div>
            <div className="task-panel-empty-copy">新发起的任务会显示在这里</div>
          </div>
        )}

        {tasks.map(task => {
          const meta = STATUS_META[task.status] || { label: task.status }
          return (
            <article key={task.id} className="task-card">
              <div className="task-card-header">
                <div className="task-card-copy">
                  <div className="task-card-title">{task.title || task.url}</div>
                </div>
                <span className={`task-status-badge ${task.status}`}>{meta.label}</span>
              </div>
              <div className="task-card-actions">
                <button onClick={() => onCancel(task.id)} className="recent-task-danger">停止</button>
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
```

Create `src/renderer/components/RecentTasksPanel.tsx` for the history:
```tsx
import { RecentTaskState } from '../../../shared/types'

interface Props {
  tasks: RecentTaskState[]
  onResume: (task: RecentTaskState) => void
  onReplay: (task: RecentTaskState) => void
  onDelete: (taskId: string) => void
  processing: boolean
}

const STATUS_META: Record<RecentTaskState['status'], { label: string }> = {
  running: { label: '处理中' },
  stopped: { label: '已停止' },
  error: { label: '失败' },
  completed: { label: '已完成' },
}

export default function RecentTasksPanel({ tasks, onResume, onReplay, onDelete, processing }: Props) {
  return (
    <aside className="task-panel" style={{ flex: 1, minHeight: 0, marginTop: '16px' }}>
      <div className="task-panel-header">
        <div>
          <div className="task-panel-title">历史记录</div>
          <div className="task-panel-subtitle">最近处理完成或停止的任务</div>
        </div>
        <div className="task-panel-count">{tasks.length}</div>
      </div>

      <div className="task-panel-list">
        {tasks.length === 0 && (
          <div className="task-panel-empty">
            <div className="task-panel-empty-icon">🕒</div>
            <div className="task-panel-empty-title">暂无历史记录</div>
            <div className="task-panel-empty-copy">已结束的任务会归档到这里</div>
          </div>
        )}

        {tasks.map(task => {
          const meta = STATUS_META[task.status] || { label: task.status }
          const canResume = task.status !== 'completed'
          return (
            <article key={task.id} className="task-card">
              <div className="task-card-header">
                <div className="task-card-copy">
                  <div className="task-card-title">{task.title || task.url}</div>
                </div>
                <span className={`task-status-badge ${task.status}`}>{meta.label}</span>
              </div>
              <div className="task-card-actions">
                {canResume && <button onClick={() => onResume(task)} disabled={processing} className="recent-task-primary">恢复</button>}
                <button onClick={() => onReplay(task)} disabled={processing} className="recent-task-secondary">重新处理</button>
                <button onClick={() => onDelete(task.id)} disabled={processing} className="recent-task-danger">删除</button>
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Verify test passes**

Run the test again. Expected: PASS.

---

### Task 3: Integrate Panels into App.tsx

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
- Delete: `g:\Podcast_Notes\src\renderer\components\RecentTasksSidebar.tsx` (optional cleanup)

- [ ] **Step 1: Write the failing test**

Append to `g:\Podcast_Notes\tests\task-architecture-ui-split.test.mjs`:
```javascript
test('App renders both ActiveTasksPanel and RecentTasksPanel', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  assert.match(source, /<ActiveTasksPanel/)
  assert.match(source, /<RecentTasksPanel/)
  assert.match(source, /const \[activeTasks,\s*setActiveTasks\]/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Implement minimal code**

In `src/renderer/App.tsx`:
1. Change imports: Remove `RecentTasksSidebar`, import `ActiveTasksPanel` and `RecentTasksPanel`.
2. Add state: `const [activeTasks, setActiveTasks] = useState<RecentTaskState[]>([])`
3. Update data fetching: Replace `getRecentTasks` calls with `getTasks`. Update `setRecentTasks` and `setActiveTasks` simultaneously wherever tasks are fetched (e.g., in `useEffect`, `handleProcessWithMode`, `handleTaskDelete`).
4. In the JSX `<aside className="workspace-aside">`:
   Remove `<RecentTasksSidebar ... />` and insert:
   ```tsx
   <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
     <ActiveTasksPanel tasks={activeTasks} onCancel={async () => { /* basic cancel hook */ await window.electronAPI.cancelProcessing() }} />
     <RecentTasksPanel tasks={recentTasks} processing={processing || cancelling} onResume={handleTaskResume} onReplay={handleTaskReplay} onDelete={handleTaskDelete} />
   </div>
   ```

- [ ] **Step 4: Verify test passes**

Run the test again. Expected: PASS.

- [ ] **Step 5: Run full refresh build**

Run: `npm run refresh:test`
Expected: The build completes and deploys successfully.
