# UI Layout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the workspace layout so the recent-tasks panel sits below the top bar, the main workspace scrolls fully, and the window controls stay pinned to the top-right.

**Architecture:** Keep the existing three-column workbench concept, but move the right aside into a shared content layer under `Header`. Split the top bar into a content region and a dedicated window-controls region, then update CSS so the shared content layer, main column, and aside all have explicit height and scroll behavior.

**Tech Stack:** React, TypeScript, CSS, Node.js built-in test runner

---

## File Map

- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
  - Move `workspace-aside` under the content area that sits beneath `Header`
  - Add a dedicated wrapper for the main column and aside
- Modify: `g:\Podcast_Notes\src\renderer\components\Header.tsx`
  - Add stable class hooks for topbar content and fixed window controls
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
  - Add the new shared content-layer layout
  - Lock down scroll behavior for the main column and right-side panel
  - Pin window controls to the top-right and preserve responsive behavior
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
  - Add static source assertions for the new structure and layout hooks

### Task 1: Lock The New JSX Structure

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\components\Header.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('workspace layout exposes shared content shell and fixed topbar regions', () => {
  const appSource = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  const headerSource = fs.readFileSync(new URL('../src/renderer/components/Header.tsx', import.meta.url), 'utf8')

  assert.match(appSource, /workspace-body/)
  assert.match(appSource, /workspace-main-column/)
  assert.match(appSource, /<div className="workspace-body">[\s\S]*<div className="workspace-main-column">[\s\S]*<aside className="workspace-aside">/)
  assert.match(headerSource, /workspace-topbar__content/)
  assert.match(headerSource, /workspace-topbar__window-controls/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL with missing matches for `workspace-body`, `workspace-main-column`, `workspace-topbar__content`, or `workspace-topbar__window-controls`.

- [ ] **Step 3: Write minimal implementation**

Update `g:\Podcast_Notes\src\renderer\App.tsx` so the content under `Header` is wrapped like this:

```tsx
<div className="workspace-main">
  <Header theme={theme} onToggleTheme={toggleTheme} status={feishuStatus} />
  <div className="workspace-body">
    <div className="workspace-main-column">
      <div className="workspace-content">
        <section className="workspace-hero">
          ...
        </section>
        <section className="workspace-input-card">
          <UrlInput onProcess={handleProcess} disabled={processing || cancelling} />
        </section>
        <section className="workspace-process-card">
          <StepPanel steps={steps} processing={processing} />
          <ControlBar
            processing={processing}
            cancelling={cancelling}
            paused={paused}
            onCancel={handleCancel}
            onResume={handleResume}
            onSettings={() => setSettingsOpen(true)}
            onClean={handleCleanTemp}
          />
        </section>
      </div>
    </div>
    <aside className="workspace-aside">
      <RecentTasksSidebar
        tasks={recentTasks}
        processing={processing || cancelling}
        onResume={handleTaskResume}
        onReplay={handleTaskReplay}
        onDelete={handleTaskDelete}
      />
    </aside>
  </div>
</div>
```

Update `g:\Podcast_Notes\src\renderer\components\Header.tsx` so the topbar body and window controls are separated:

```tsx
<div className="workspace-topbar" style={{ ... }}>
  <div className="workspace-topbar__content" style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1,
  }}>
    <div style={{ width: 22, height: 22, ... }}>
      🎧
    </div>
    <span style={{ fontSize: 12, fontWeight: 500, ... }}>
      播客笔记助手
    </span>
    <div className="workspace-topbar__search-wrap" aria-hidden="true" style={{ ... }}>
      ...
    </div>
    <div className="workspace-topbar__actions" style={{ ... }}>
      <StatusBar status={status} />
      <button onClick={onToggleTheme} style={themeBtn}>
        {theme === 'dark' ? '浅色' : '深色'}
      </button>
    </div>
  </div>
  <div className="workspace-topbar__window-controls" style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' as any }}>
    <button onClick={handleMinimize} style={tbBtn}>─</button>
    <button onClick={handleMaximize} style={tbBtn}>□</button>
    <button onClick={handleClose} style={{ ...tbBtn, close: true }}>✕</button>
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS for the new structure test, with any remaining failures limited to CSS assertions not yet implemented.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Header.tsx tests/ui-theme-source.test.mjs
git commit -m "refactor: restructure workspace layout shell"
```

### Task 2: Add Layout And Scroll Rules

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`

- [ ] **Step 1: Write the failing test**

Append this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('layout css pins window controls and enables main and aside scrolling', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /\.workspace-body\s*\{[\s\S]*display:\s*flex;/)
  assert.match(cssSource, /\.workspace-body\s*\{[\s\S]*min-height:\s*0;/)
  assert.match(cssSource, /\.workspace-main-column\s*\{[\s\S]*min-width:\s*0;/)
  assert.match(cssSource, /\.workspace-main-column\s*\{[\s\S]*overflow:\s*hidden;/)
  assert.match(cssSource, /\.workspace-content\s*\{[\s\S]*overflow-y:\s*auto;/)
  assert.match(cssSource, /\.workspace-aside\s*\{[\s\S]*padding:\s*24px 24px 16px 0;/)
  assert.match(cssSource, /\.workspace-topbar__window-controls\s*\{[\s\S]*margin-left:\s*16px;/)
  assert.match(cssSource, /\.task-panel-list\s*\{[\s\S]*overflow-y:\s*auto;/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL because the new `.workspace-body`, `.workspace-main-column`, and `.workspace-topbar__window-controls` rules do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add these rules to `g:\Podcast_Notes\src\renderer\styles\globals.css` near the existing workspace layout section:

```css
.workspace-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.workspace-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.workspace-main-column {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.workspace-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px 28px 16px;
  overflow-y: auto;
}

.workspace-topbar__content {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.workspace-topbar__window-controls {
  display: flex;
  gap: 6px;
  margin-left: 16px;
  flex-shrink: 0;
}
```

Keep `g:\Podcast_Notes\src\renderer\styles\globals.css` aligned with the new shell by preserving these right-side rules:

```css
.workspace-aside {
  width: 320px;
  min-width: 320px;
  min-height: 0;
  padding: 24px 24px 16px 0;
  display: flex;
  align-items: stretch;
}

.task-panel {
  width: 292px;
  min-width: 292px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 16px;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 48%),
    var(--bg-panel);
  box-shadow: var(--panel-shadow);
}

.task-panel-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 2px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS for the new CSS layout test and the earlier structure test.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "fix: restore workspace scrolling and pinned window controls"
```

### Task 3: Preserve Responsive Behavior And Verify

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`

- [ ] **Step 1: Write the failing test**

Append this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('responsive rules adapt the new content shell at narrower widths', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1280px\)[\s\S]*\.workspace-body\s*\{[\s\S]*min-height:\s*0;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-body\s*\{[\s\S]*flex-direction:\s*column;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-aside\s*\{[\s\S]*padding:\s*0 20px 16px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-topbar__window-controls\s*\{[\s\S]*margin-left:\s*8px;/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL because the responsive media blocks do not yet mention the new shell or the new window-controls class.

- [ ] **Step 3: Write minimal implementation**

Update the responsive sections in `g:\Podcast_Notes\src\renderer\styles\globals.css` so they include the new wrappers:

```css
@media (max-width: 1280px) {
  .workspace-body {
    min-height: 0;
  }

  .workspace-main-column {
    min-height: 0;
  }
}

@media (max-width: 1100px) {
  .workspace-body {
    flex-direction: column;
  }

  .workspace-main-column {
    overflow: visible;
  }

  .workspace-aside {
    width: auto;
    min-width: 0;
    padding: 0 20px 16px;
  }

  .workspace-topbar__window-controls {
    margin-left: 8px;
  }
}
```

- [ ] **Step 4: Run tests and diagnostics**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS.

Then run:

```bash
npm run refresh:test
```

Expected: build and deploy complete to `g:\Podcast_Notes\dist-exe\win-unpacked`.

Then run diagnostics for:

```text
g:\Podcast_Notes\src\renderer\App.tsx
g:\Podcast_Notes\src\renderer\components\Header.tsx
g:\Podcast_Notes\src\renderer\styles\globals.css
g:\Podcast_Notes\tests\ui-theme-source.test.mjs
```

Expected: no new diagnostics caused by the layout change.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Header.tsx src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "fix: polish workspace layout responsiveness"
```

## Self-Review

- Spec coverage:
  - Right-side panel moved below the topbar: covered by Task 1 and Task 2
  - Main workspace scroll restored: covered by Task 2
  - Topbar layout stabilized: covered by Task 1 and Task 2
  - Window controls fixed at top-right: covered by Task 1, Task 2, and Task 3
  - Responsive compatibility preserved: covered by Task 3
- Placeholder scan:
  - No `TODO`, `TBD`, or implicit “write tests later” steps remain
  - Each test step includes exact assertion code and exact commands
- Type consistency:
  - New class names are consistent across plan tasks: `workspace-body`, `workspace-main-column`, `workspace-topbar__content`, `workspace-topbar__window-controls`
