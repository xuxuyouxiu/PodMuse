# UI Narrow Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the narrow-screen layout so the input actions remain in a single compact row, and the entire workspace body scrolls as one unit to prevent the recent tasks aside from overlapping the main content.

**Architecture:** We will modify the CSS media query for `< 1100px`. First, we shift the `overflow-y: auto` responsibility from `.workspace-content` up to `.workspace-body`, ensuring all child columns flow naturally without overlapping. Second, we revert the input actions from a stacked column back to a flex row, adjusting padding and `min-width` to ensure they fit.

**Tech Stack:** CSS, Node.js built-in test runner

---

### Task 1: Lock Layout Fixes With Tests

**Files:**
- Modify: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: Write the failing test**

Modify the existing test `narrow layout stacks url input actions and keeps compact card padding` in `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`. Rename it to reflect the new horizontal compact layout and unified scrolling.

Replace the old test:
```javascript
test('narrow layout stacks url input actions and keeps compact card padding', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-actions\s*\{[\s\S]*flex-direction:\s*column;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-field\s*\{[\s\S]*width:\s*100%;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-submit\s*\{[\s\S]*width:\s*100%;/)
})
```

With the new test:
```javascript
test('narrow layout keeps input actions horizontal and unifies scrolling on workspace-body', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  // Verify workspace-body takes over scrolling
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-body\s*\{[\s\S]*overflow-y:\s*auto;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-content\s*\{[\s\S]*overflow-y:\s*visible;/)
  
  // Verify input actions remain horizontal but compact
  assert.doesNotMatch(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-actions\s*\{[\s\S]*flex-direction:\s*column;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-submit\s*\{[\s\S]*padding:\s*0 14px;/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-theme-source.test.mjs`
Expected: FAIL. The new assertions will fail because `globals.css` still has the old column layout and lacks the new scrolling rules.

---

### Task 2: Implement CSS Layout Fixes

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`

- [ ] **Step 1: Write minimal implementation**

Edit `g:\Podcast_Notes\src\renderer\styles\globals.css` inside the `@media (max-width: 1100px)` block (around line 1088).

1. Update `.workspace-body` to handle scrolling:
```css
  .workspace-body {
    flex-direction: column;
    overflow-y: auto;
  }
```

2. Update `.workspace-content` to prevent inner scrolling:
```css
  .workspace-content {
    padding: 18px 20px 14px;
    overflow-y: visible;
  }
```

3. Remove the old `.url-input-actions` block entirely (so it falls back to the default flex row).

4. Update `.url-input-field` to just have `min-width: 0`:
```css
  .url-input-field {
    min-width: 0;
  }
```

5. Update `.url-input-submit` to reduce padding instead of forcing 100% width:
```css
  .url-input-submit {
    padding: 0 14px;
  }
```

Make sure you remove the old `width: 100%` and `flex-direction: column` rules from these blocks inside the media query.

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/ui-theme-source.test.mjs`
Expected: PASS.

- [ ] **Step 3: Run full refresh build**

Run: `npm run refresh:test`
Expected: The build completes and deploys successfully.
