# UI Narrow Layout Form Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the narrow-width layout so the input card switches to a stacked form while recent tasks stays below the main workspace.

**Architecture:** Keep the current `1100px` breakpoint where the main workspace and recent-tasks panel stack vertically, but teach the main workspace cards to enter a compact narrow-screen mode. Implement the change almost entirely in `globals.css`, only touching `UrlInput.tsx` if the existing class hooks are insufficient.

**Tech Stack:** React, TypeScript, CSS, Node.js built-in test runner

---

## File Map

- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
  - Add compact narrow-screen padding rules for the hero and input cards
  - Switch `url-input-actions` to a vertical form layout under the existing narrow breakpoint
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
  - Add static assertions for narrow-screen form stacking
- Optional Modify: `g:\Podcast_Notes\src\renderer\components\UrlInput.tsx`
  - Only if new class hooks are needed; avoid if current classes are sufficient

### Task 1: Lock Narrow Form Stacking With Tests

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: Write the failing test**

Append this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('narrow layout stacks url input actions and keeps compact card padding', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-actions\s*\{[\s\S]*flex-direction:\s*column;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-submit\s*\{[\s\S]*width:\s*100%;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-hero\s*\{[\s\S]*padding:\s*18px 20px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-input-card\s*\{[\s\S]*padding:\s*16px 18px;/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL because the current narrow-screen CSS does not yet stack `.url-input-actions` vertically or force `.url-input-submit` to full width.

- [ ] **Step 3: Write minimal implementation**

Update the `@media (max-width: 1100px)` block in `g:\Podcast_Notes\src\renderer\styles\globals.css` with:

```css
.workspace-hero {
  padding: 18px 20px;
}

.workspace-input-card {
  padding: 16px 18px;
}

.url-input-actions {
  flex-direction: column;
  align-items: stretch;
}

.url-input-field {
  min-width: 0;
  width: 100%;
}

.url-input-submit {
  width: 100%;
  justify-content: center;
}
```

Do not change the existing decision to keep `workspace-aside` stacked below the main workspace.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS for the new narrow-layout test.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "fix: stack narrow workspace input form"
```

### Task 2: Tighten Narrow-Screen Card Rhythm

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`

- [ ] **Step 1: Write the failing test**

Append this test to `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`:

```js
test('narrow layout reduces hero and form spacing for a tighter vertical rhythm', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-hero__description\s*\{[\s\S]*margin-top:\s*8px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-card\s*\{[\s\S]*gap:\s*12px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-copy\s*\{[\s\S]*gap:\s*6px;/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: FAIL because the current narrow-screen CSS does not yet tighten those vertical gaps.

- [ ] **Step 3: Write minimal implementation**

Extend the `@media (max-width: 1100px)` block in `g:\Podcast_Notes\src\renderer\styles\globals.css` with:

```css
.workspace-hero__description {
  margin-top: 8px;
}

.url-input-card {
  gap: 12px;
}

.url-input-copy {
  gap: 6px;
}
```

And ensure the base layout supports that gap-driven copy block:

```css
.url-input-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS for the new spacing test and all previous UI source tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "fix: tighten narrow workspace card spacing"
```

### Task 3: Verify Fixed Test Build And Diagnostics

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
- Test: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: Re-run the focused UI source tests**

Run:

```bash
node --test tests/ui-theme-source.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Refresh the fixed test build**

Run:

```bash
npm run refresh:test
```

Expected: build and deploy complete to `g:\Podcast_Notes\dist-exe\win-unpacked`.

If deployment fails because a file in `dist-exe\win-unpacked` is locked, clear the existing app processes under `G:\Podcast_Notes` first, then re-run only:

```bash
npm run deploy:test
```

Expected: PASS.

- [ ] **Step 3: Run diagnostics on touched files**

Check diagnostics for:

```text
g:\Podcast_Notes\src\renderer\styles\globals.css
g:\Podcast_Notes\tests\ui-theme-source.test.mjs
```

Expected: no new diagnostics.

- [ ] **Step 4: Smoke-check implementation scope**

Verify the changed CSS only affects the narrow stacked mode:

```text
- recent tasks still stays below the workspace under 1100px
- url input button is fully visible
- url input field and button no longer fight for one row
- wide layout rules remain untouched
```

Expected: all conditions true.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "fix: polish narrow stacked workspace layout"
```

## Self-Review

- Spec coverage:
  - Keep recent tasks below the main workspace: covered by Task 1 and Task 3
  - Stack the input form vertically in narrow mode: covered by Task 1
  - Tighten hero and input card spacing in narrow mode: covered by Task 2
  - Preserve wide layout: covered by Task 3
- Placeholder scan:
  - No `TODO`, `TBD`, or vague “adjust visually” steps remain
  - Every step has exact commands and explicit CSS to add
- Type consistency:
  - The plan consistently uses existing hooks: `workspace-hero`, `workspace-input-card`, `url-input-actions`, `url-input-field`, `url-input-submit`, `url-input-card`, `url-input-copy`
