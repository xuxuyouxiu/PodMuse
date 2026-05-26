# Sidebar Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Settings and About from the task control bar to the bottom of the left sidebar, group system vs business logic clearly, remove "Clean Cache", and ensure these options remain accessible on narrow screens.

**Architecture:** We will update `ControlBar.tsx` to strip out the global actions. We will update `WorkspaceSidebar.tsx` to accept `onSettings` and `onAbout` callbacks and display these items with proper SVG icons anchored at the bottom using flexbox `margin-top: auto`. To maintain accessibility when the sidebar is hidden (`<1100px`), we will add a fallback Settings icon to `Header.tsx` that only displays in compact mode.

**Tech Stack:** React, TypeScript, CSS, Node.js built-in test runner

---

### Task 1: Lock Layout Changes With Tests

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append tests to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs` to enforce the new structural expectations.

```javascript
test('sidebar exposes system operations hook and settings/about callbacks', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/WorkspaceSidebar.tsx', import.meta.url), 'utf8')

  assert.match(source, /workspace-sidebar__system-ops/)
  assert.match(source, /onSettings/)
  assert.match(source, /onAbout/)
})

test('control bar removes global actions and clean cache', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/ControlBar.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /onClean/)
  assert.doesNotMatch(source, /清理缓存/)
  assert.doesNotMatch(source, /关于/)
})

test('header exposes mobile fallback settings action', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/Header.tsx', import.meta.url), 'utf8')

  assert.match(source, /workspace-topbar__mobile-settings/)
  assert.match(source, /onSettings/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-theme-source.test.mjs`
Expected: FAIL.

---

### Task 2: Implement Component Refactoring

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\components\ControlBar.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\components\WorkspaceSidebar.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\components\Header.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`

- [ ] **Step 1: Refactor ControlBar.tsx**

Remove `onSettings` and `onClean` from props. Remove the secondary buttons for Settings, Clean Cache, and About.
```tsx
interface Props {
  processing: boolean
  cancelling: boolean
  paused: boolean
  onCancel: () => void
  onResume: () => void
}
// inside return:
      <div className="control-bar-group">
        <button
          className="control-bar-primary"
          // ... rest of the main button code ...
        >
          {primaryLabel}
        </button>
      </div>
```

- [ ] **Step 2: Refactor WorkspaceSidebar.tsx**

Add `onSettings` and `onAbout` to props. Replace the hardcoded `设置` nav item and the old `footer` with a new `system-ops` section.
```tsx
interface Props {
  onSettings: () => void
  onAbout: () => void
}

export default function WorkspaceSidebar({ onSettings, onAbout }: Props) {
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar__brand">
        <div className="workspace-sidebar__logo">PA</div>
        <div>
          <div className="workspace-sidebar__title">播客笔记助手</div>
          <div className="workspace-sidebar__subtitle">Workspace</div>
        </div>
      </div>

      <nav className="workspace-sidebar__nav" aria-label="工作台导航">
        <button type="button" className="workspace-sidebar__nav-item is-active">
          工作台
        </button>
        <button type="button" className="workspace-sidebar__nav-item">
          最近任务
        </button>
      </nav>

      <div className="workspace-sidebar__system-ops" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button type="button" className="workspace-sidebar__nav-item" onClick={onSettings} style={{ gap: '10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          设置
        </button>
        <button type="button" className="workspace-sidebar__nav-item" onClick={onAbout} style={{ gap: '10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
          关于
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Refactor Header.tsx**

Add `onSettings` prop. Add a fallback icon button right before the theme toggle that has class `workspace-topbar__mobile-settings`.
```tsx
interface HeaderProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  status: FeishuStatus
  onSettings: () => void
}
// inside actions container, before theme toggle:
        <button className="workspace-topbar__mobile-settings" onClick={onSettings} style={themeBtn}>
          ⚙
        </button>
```

- [ ] **Step 4: Refactor App.tsx**

Pass the appropriate functions to `WorkspaceSidebar`, `Header`, and `ControlBar`.
Remove `handleCleanTemp` entirely.
```tsx
        <WorkspaceSidebar 
          onSettings={() => setSettingsOpen(true)}
          onAbout={() => alert('播客笔记助手 v3.0\n\n小宇宙 → 下载 → Whisper → DeepSeek → Obsidian')}
        />
        // ...
          <Header theme={theme} onToggleTheme={toggleTheme} status={feishuStatus} onSettings={() => setSettingsOpen(true)} />
        // ...
                  <ControlBar
                    processing={processing}
                    cancelling={cancelling}
                    paused={paused}
                    onCancel={handleCancel}
                    onResume={handleResume}
                  />
```

---

### Task 3: Adjust Global CSS for Narrow Sidebar Settings Fallback

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`

- [ ] **Step 1: Write CSS changes**

In the base styles, hide the mobile settings button:
```css
.workspace-topbar__mobile-settings {
  display: none;
}
```

Inside `@media (max-width: 1100px)` (around line 1100), reveal the mobile settings button:
```css
  .workspace-topbar__mobile-settings {
    display: flex;
  }
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/ui-theme-source.test.mjs`
Expected: PASS.

- [ ] **Step 3: Build & Deploy**

Run: `npm run refresh:test`
Expected: Successful deploy.
