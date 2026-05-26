# UI Card Elastic Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the input card and process card resize naturally with window size so they feel fuller in large windows and tighter in smaller windows.

**Architecture:** Keep the existing card structure and business logic, but replace the current fixed spacing strategy with CSS-driven elastic spacing and height rules. Move `StepPanel`'s hard-coded height and padding styles out of inline JSX into semantic classes so idle and active states can share the same responsive layout system.

**Tech Stack:** React, TypeScript, CSS, Node.js built-in test runner

---

## File Map

- Modify: `g:\Podcast_Notes\src\renderer\components\StepPanel.tsx`
  - Replace inline fixed card sizing with semantic classes for idle and active states
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
  - Add elastic padding, gap, and height rules using `clamp()` and bounded min/max sizing
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
  - Add static assertions that lock the new class hooks and the removal of fixed `minHeight: 280`

### Task 1: Lock The Elastic Layout Contract With Tests

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: Write the failing test**

Append this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('step panel exposes elastic layout hooks instead of fixed height inline styles', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/StepPanel.tsx', import.meta.url), 'utf8')

  assert.match(source, /step-panel-card--idle/)
  assert.match(source, /step-panel-card--active/)
  assert.match(source, /step-panel-body--idle/)
  assert.doesNotMatch(source, /minHeight:\s*280/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL because `StepPanel.tsx` does not yet expose those class names and still contains `minHeight: 280`.

- [ ] **Step 3: Write minimal implementation**

Update the idle and active containers in `g:\Podcast_Notes\src\renderer\components\StepPanel.tsx` like this:

```tsx
<div className="step-panel-card step-panel-card--idle" style={{
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)',
  position: 'relative',
  overflow: 'hidden',
}}>
  <div className="step-panel-glow" style={{ ... }} />
  <div className="step-panel-empty step-panel-body--idle" style={{ textAlign: 'center', zIndex: 1 }}>
    ...
  </div>
</div>
```

And update the active container like this:

```tsx
<div className="step-panel-card step-panel-card--active" style={{
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)',
  position: 'relative',
  overflow: 'hidden',
}}>
  <div className="step-panel-glow" style={{ ... }} />

  <div className="step-panel-body step-panel-body--active" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, zIndex: 1 }}>
    ...
  </div>
</div>
```

Remove the inline `minHeight: 280` and `padding: '32px 40px'` from both top-level card containers.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS for the new elastic layout contract test.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/StepPanel.tsx tests/ui-theme-source.test.mjs
git commit -m "refactor: expose elastic step panel layout hooks"
```

### Task 2: Add Elastic Card Spacing And Height Rules

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`

- [ ] **Step 1: Write the failing test**

Append this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('globals defines elastic spacing for input and process cards', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /\.workspace-input-card\s*\{[\s\S]*padding:\s*clamp\(/)
  assert.match(cssSource, /\.workspace-process-card\s*\{[\s\S]*padding:\s*clamp\(/)
  assert.match(cssSource, /\.url-input-card\s*\{[\s\S]*gap:\s*clamp\(/)
  assert.match(cssSource, /\.step-panel-card--idle\s*\{[\s\S]*min-height:\s*clamp\(/)
  assert.match(cssSource, /\.step-panel-card--active\s*\{[\s\S]*min-height:\s*clamp\(/)
  assert.match(cssSource, /\.step-panel-body--idle\s*\{[\s\S]*gap:\s*clamp\(/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL because `globals.css` still uses fixed padding for the cards and does not yet define the new elastic `StepPanel` classes.

- [ ] **Step 3: Write minimal implementation**

Update `g:\Podcast_Notes\src\renderer\styles\globals.css` with elastic rules like these:

```css
.workspace-input-card {
  padding: clamp(18px, 2.2vw, 28px);
}

.workspace-process-card {
  padding: clamp(18px, 2.2vw, 28px) clamp(18px, 2.2vw, 28px) clamp(16px, 2vw, 22px);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.url-input-card {
  display: flex;
  flex-direction: column;
  gap: clamp(14px, 1.8vw, 18px);
}

.step-panel-card--idle,
.step-panel-card--active {
  width: 100%;
  min-height: clamp(220px, 34vh, 360px);
  padding: clamp(20px, 3vw, 32px) clamp(20px, 3.4vw, 40px);
}

.step-panel-card--active {
  justify-content: flex-start;
}

.step-panel-body--idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 1.8vw, 16px);
}

.step-panel-body--active {
  gap: clamp(16px, 2.2vw, 22px);
}
```

Keep the rest of the process-card and status-card visuals unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS for the new elastic spacing test and all previously passing UI source tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "fix: add elastic spacing for main workflow cards"
```

### Task 3: Tune Small-Window Shrink Behavior And Verify Build

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
- Test: `g:\Podcast_Notes\src\renderer\components\StepPanel.tsx`

- [ ] **Step 1: Write the failing test**

Append this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('responsive rules tighten elastic cards on narrower windows', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1280px\)[\s\S]*\.step-panel-card--idle\s*\{[\s\S]*min-height:\s*clamp\(/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-input-card\s*\{[\s\S]*padding:\s*16px 18px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-process-card\s*\{[\s\S]*padding:\s*16px 18px 14px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.step-panel-card--idle\s*\{[\s\S]*min-height:\s*200px;/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL because the media queries do not yet override the elastic card spacing for narrower widths.

- [ ] **Step 3: Write minimal implementation**

Extend the existing responsive blocks in `g:\Podcast_Notes\src\renderer\styles\globals.css` with:

```css
@media (max-width: 1280px) {
  .step-panel-card--idle,
  .step-panel-card--active {
    min-height: clamp(210px, 32vh, 320px);
  }
}

@media (max-width: 1100px) {
  .workspace-input-card {
    padding: 16px 18px;
  }

  .workspace-process-card {
    padding: 16px 18px 14px;
  }

  .url-input-card {
    gap: 12px;
  }

  .step-panel-card--idle,
  .step-panel-card--active {
    min-height: 200px;
    padding: 18px 20px;
  }

  .step-panel-body--idle,
  .step-panel-body--active {
    gap: 12px;
  }
}
```

- [ ] **Step 4: Run tests, build, and diagnostics**

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
g:\Podcast_Notes\src\renderer\components\StepPanel.tsx
g:\Podcast_Notes\src\renderer\styles\globals.css
g:\Podcast_Notes\tests\ui-theme-source.test.mjs
```

Expected: no new diagnostics caused by the elastic layout change.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/StepPanel.tsx src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "fix: make workflow cards resize elastically"
```

## Self-Review

- Spec coverage:
  - Input card elastic spacing: covered by Task 2 and Task 3
  - Process card elastic spacing: covered by Task 2 and Task 3
  - Remove fixed `StepPanel` height: covered by Task 1
  - Add idle and active class hooks: covered by Task 1
  - Preserve readability in smaller windows: covered by Task 3
  - Verify build and diagnostics: covered by Task 3
- Placeholder scan:
  - No `TODO`, `TBD`, or vague “adjust as needed” steps remain
  - Each task includes exact code, commands, and expected outcomes
- Type consistency:
  - New class names are consistent across tasks: `step-panel-card--idle`, `step-panel-card--active`, `step-panel-body--idle`, `step-panel-body--active`
