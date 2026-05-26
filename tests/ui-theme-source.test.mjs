import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('App stores explicit theme choice in localStorage', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')

  assert.match(source, /localStorage\.getItem\(['"]podcast-theme['"]\)/)
  assert.match(source, /localStorage\.setItem\(['"]podcast-theme['"],\s*nextTheme\)/)
})

test('globals defines dark and light theme variables', () => {
  const source = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(source, /\[data-theme='dark'\]/)
  assert.match(source, /\[data-theme='light'\]/)
})

test('App renders workspace shell with sidebar, main content and aside panel', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')

  assert.match(source, /<WorkspaceSidebar/)
  assert.match(source, /workspace-main/)
  assert.match(source, /workspace-aside/)
})

test('main workflow uses hero, input and process card sections', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')

  assert.match(source, /workspace-hero/)
  assert.match(source, /workspace-input-card/)
  assert.match(source, /workspace-process-card/)
})

test('workflow components expose visual styling hooks', () => {
  const urlInput = fs.readFileSync(new URL('../src/renderer/components/UrlInput.tsx', import.meta.url), 'utf8')
  const stepPanel = fs.readFileSync(new URL('../src/renderer/components/StepPanel.tsx', import.meta.url), 'utf8')
  const controlBar = fs.readFileSync(new URL('../src/renderer/components/ControlBar.tsx', import.meta.url), 'utf8')

  assert.match(urlInput, /url-input-card|url-input-actions|url-input-submit/)
  assert.match(stepPanel, /step-panel-card|step-panel-summary|step-node-label/)
  assert.match(controlBar, /control-bar|control-bar-primary|control-bar-group/)
})

test('WorkspaceSidebar exposes workspace sidebar styling hook', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/WorkspaceSidebar.tsx', import.meta.url), 'utf8')

  assert.match(source, /workspace-sidebar/)
})

test('Header exposes theme toggle and search placeholder shell', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/Header.tsx', import.meta.url), 'utf8')

  assert.match(source, /onToggleTheme/)
  assert.match(source, /theme:\s*'dark'\s*\|\s*'light'/)
  assert.match(source, /搜索播客|搜索笔记|搜索关键词/)
})

test('App wires theme, toggle handler and status into Header', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')

  assert.match(source, /<Header[\s\S]*theme=\{theme\}/)
  assert.match(source, /<Header[\s\S]*onToggleTheme=\{toggleTheme\}/)
  assert.match(source, /<Header[\s\S]*status=\{feishuStatus\}/)
})

test('task panels use card and status styling hooks', () => {
  const activeSource = fs.readFileSync(new URL('../src/renderer/components/ActiveTasksPanel.tsx', import.meta.url), 'utf8')
  const recentSource = fs.readFileSync(new URL('../src/renderer/components/RecentTasksPanel.tsx', import.meta.url), 'utf8')

  assert.match(activeSource, /task-panel|task-card|task-status-badge/)
  assert.match(recentSource, /task-panel|task-card|task-status-badge/)
})

test('settings dialog includes grouped sections styling hooks', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/SettingsDialog.tsx', import.meta.url), 'utf8')

  assert.match(source, /settings-section|settings-grid/)
})

test('window defaults and responsive layout support smaller first-open sizes', () => {
  const mainSource = fs.readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(mainSource, /width:\s*1180/)
  assert.match(mainSource, /height:\s*780/)
  assert.match(mainSource, /minWidth:\s*960/)
  assert.match(mainSource, /minHeight:\s*680/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)/)
  assert.match(cssSource, /flex-direction:\s*column;/)
  assert.match(cssSource, /workspace-sidebar[\s\S]*display:\s*none;/)
})

test('light theme sidebar and medium-width workspace use dedicated compact styling', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /--sidebar-bg:/)
  assert.match(cssSource, /\.workspace-sidebar\s*\{[\s\S]*background:\s*var\(--sidebar-bg\)/)
  assert.match(cssSource, /@media \(max-width:\s*1280px\)/)
  assert.match(cssSource, /\.workspace-topbar__actions\s*\{[\s\S]*flex-wrap:\s*wrap;/)
  assert.match(cssSource, /\.status-bar__meta\s*\{[\s\S]*display:\s*none;/)
})

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

test('sidebar exposes settings action instead of header fallback', () => {
  const sidebarSource = fs.readFileSync(new URL('../src/renderer/components/WorkspaceSidebar.tsx', import.meta.url), 'utf8')

  assert.match(sidebarSource, /onSettings/)
  assert.doesNotMatch(sidebarSource, /workspace-topbar__mobile-settings/)
})

test('workspace layout exposes shared content shell and fixed topbar regions', () => {
  const appSource = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  const headerSource = fs.readFileSync(new URL('../src/renderer/components/Header.tsx', import.meta.url), 'utf8')
  
  assert.match(appSource, /workspace-body/)
  assert.match(appSource, /workspace-main-column/)
  assert.match(appSource, /<div className="workspace-body">[\s\S]*<div className="workspace-main-column">[\s\S]*<aside className="workspace-aside">/)
  assert.match(headerSource, /workspace-topbar__content/)
  assert.match(headerSource, /workspace-topbar__window-controls/)
})

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

test('responsive rules adapt the new content shell at narrower widths', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1280px\)[\s\S]*\.workspace-body\s*\{[\s\S]*min-height:\s*0;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-body\s*\{[\s\S]*flex-direction:\s*column;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-aside\s*\{[\s\S]*padding:\s*0 20px 16px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-topbar__window-controls\s*\{[\s\S]*margin-left:\s*8px;/)
})

test('step panel exposes elastic layout hooks instead of fixed height inline styles', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/StepPanel.tsx', import.meta.url), 'utf8')

  assert.match(source, /step-panel-card--idle/)
  assert.match(source, /step-panel-card--active/)
  assert.match(source, /step-panel-body--idle/)
  assert.doesNotMatch(source, /minHeight:\s*280/)
})

test('globals defines elastic spacing for input and process cards', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /\.workspace-input-card\s*\{[\s\S]*padding:\s*clamp\(/)
  assert.match(cssSource, /\.workspace-process-card\s*\{[\s\S]*padding:\s*clamp\(/)
  assert.match(cssSource, /\.url-input-card\s*\{[\s\S]*gap:\s*clamp\(/)
  assert.match(cssSource, /\.step-panel-card--idle\s*\{[\s\S]*min-height:\s*clamp\(/)
  assert.match(cssSource, /\.step-panel-card--active\s*\{[\s\S]*min-height:\s*clamp\(/)
  assert.match(cssSource, /\.step-panel-body--idle\s*\{[\s\S]*gap:\s*clamp\(/)
})

test('responsive rules tighten elastic cards on narrower windows', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1280px\)[\s\S]*\.step-panel-card--idle\s*\{[\s\S]*min-height:\s*clamp\(/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-input-card\s*\{[\s\S]*padding:\s*16px 18px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-process-card\s*\{[\s\S]*padding:\s*16px 18px 14px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.step-panel-card--idle\s*\{[\s\S]*min-height:\s*200px;/)
})

test('narrow layout keeps input actions horizontal and unifies scrolling on workspace-body', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-body\s*\{[\s\S]*overflow-y:\s*auto;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-content\s*\{[\s\S]*overflow-y:\s*visible;/)
  
  assert.doesNotMatch(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-actions\s*\{[\s\S]*flex-direction:\s*column;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-submit\s*\{[\s\S]*padding:\s*0 14px;/)
})

test('narrow layout reduces hero and form spacing for a tighter vertical rhythm', () => {
  const cssSource = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.workspace-hero__description\s*\{[\s\S]*margin-top:\s*8px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-card\s*\{[\s\S]*gap:\s*12px;/)
  assert.match(cssSource, /@media \(max-width:\s*1100px\)[\s\S]*\.url-input-copy\s*\{[\s\S]*gap:\s*6px;/)
})
