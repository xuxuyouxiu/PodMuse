import { useState, useEffect, useCallback, useRef } from 'react'
import { StepInfo, PodcastConfig, FeishuStatus, RecentTaskState } from '../../shared/types'
import Header from './components/Header'
import UrlInput from './components/UrlInput'
import StepPanel from './components/StepPanel'
import ControlBar from './components/ControlBar'
import ActiveTasksPanel from './components/ActiveTasksPanel'
import RecentTasksPanel from './components/RecentTasksPanel'
import SettingsDialog from './components/SettingsDialog'
import WorkspaceSidebar from './components/WorkspaceSidebar'
import './styles/globals.css'

type ThemeMode = 'dark' | 'light'

const STEP_DEFS = [
  { title: '解析页面', subtitle: '提取音频' },
  { title: '下载音频', subtitle: '获取文件' },
  { title: '语音转文字', subtitle: 'Whisper' },
  { title: '修正专有名词', subtitle: 'DeepSeek' },
  { title: 'AI 提炼笔记', subtitle: 'DeepSeek' },
]

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('podcast-theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [config, setConfig] = useState<PodcastConfig | null>(null)
  const [feishuStatus, setFeishuStatus] = useState<FeishuStatus>({ connected: false, monitoring: false, chatId: '' })
  const [steps, setSteps] = useState<StepInfo[]>(STEP_DEFS.map((s, i) => ({ ...s, step: i + 1, status: 'pending' as const })))
  const [processing, setProcessing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lastUrl, setLastUrl] = useState<string | null>(null)
  const [activeTasks, setActiveTasks] = useState<RecentTaskState[]>([])
  const [recentTasks, setRecentTasks] = useState<RecentTaskState[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const cancelFlag = useRef(false)

  const paused = !processing && steps.every(s => s.status === 'stopped')
  const workflowStateLabel = processing ? '处理中' : cancelling ? '停止中' : paused ? '已暂停' : '待命中'

  const step1 = steps[0]
  const PLACEHOLDER_TITLES = new Set(['提取音频链接', '提取音频'])
  const currentTitle = (step1 && step1.status !== 'pending' && step1.subtitle && !PLACEHOLDER_TITLES.has(step1.subtitle))
    ? step1.subtitle
    : null

  useEffect(() => {
    window.electronAPI.getConfig().then(setConfig)
    window.electronAPI.getTasks().then(({ activeTasks: aTasks, recentTasks: rTasks }) => {
      setActiveTasks(aTasks)
      setRecentTasks(rTasks)
      const latestPending = aTasks.find(task => task.status !== 'completed')
      setLastUrl(latestPending?.url || aTasks[0]?.url || null)
    })
    window.electronAPI.onStepUpdate((step: StepInfo) => {
      // #region debug-point E:renderer-step3-update
      if (step.step === 3) { fetch('http://127.0.0.1:7777/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'whisper-history-bugs',runId:'pre-fix',hypothesisId:'E',location:'src/renderer/App.tsx:onStepUpdate',msg:'[DEBUG] renderer received step3 update',data:{subtitle:step.subtitle,status:step.status,detail:step.detail,progress:step.progress},ts:Date.now()})}).catch(()=>{}) }
      // #endregion
      setSteps(prev => prev.map(s => s.step === step.step ? { ...s, ...step } : s))
    })
    window.electronAPI.onFeishuStatus((status: FeishuStatus) => {
      setFeishuStatus(status)
    })
    window.electronAPI.onProcessingChange((p: boolean, url?: string) => {
      setProcessing(p)
      if (p && url) setLastUrl(url)
      if (!p && cancelFlag.current) {
        cancelFlag.current = false
        setCancelling(false)
      }
    })
  }, [])

  useEffect(() => {
    window.electronAPI.startFeishu().then(s => s && setFeishuStatus(s))
  }, [])

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  const handleProcess = useCallback(async (url: string) => {
    return handleProcessWithMode(url, false)
  }, [])

  const handleProcessWithMode = useCallback(async (url: string, force: boolean, taskId?: string) => {
    cancelFlag.current = false
    setProcessing(true)
    setLastUrl(url)
    setSteps(STEP_DEFS.map((s, i) => ({ ...s, step: i + 1, status: 'pending' as const })))
    const result = await window.electronAPI.processPodcast(url, force, taskId)
    setProcessing(false)
    const { activeTasks: aTasks, recentTasks: rTasks } = await window.electronAPI.getTasks()
    setActiveTasks(aTasks)
    setRecentTasks(rTasks)
    const latestPending = aTasks.find((task: RecentTaskState) => task.status !== 'completed')
    setLastUrl(latestPending?.url || aTasks[0]?.url || url)
    if (cancelFlag.current) {
      cancelFlag.current = false
      setCancelling(false)
    }
    return result
  }, [])

  const handleCancel = useCallback(async () => {
    cancelFlag.current = true
    setCancelling(true)
    await window.electronAPI.cancelProcessing()
  }, [])

  const handleResume = useCallback(() => {
    if (lastUrl) handleProcess(lastUrl)
  }, [lastUrl, handleProcess])

  const handleTaskResume = useCallback((task: RecentTaskState) => {
    setLastUrl(task.url)
    handleProcessWithMode(task.url, false, task.id)
  }, [handleProcessWithMode])

  const handleTaskReplay = useCallback((task: RecentTaskState) => {
    setLastUrl(task.url)
    handleProcessWithMode(task.url, true, task.id)
  }, [handleProcessWithMode])

  const handleTaskDelete = useCallback(async (taskId: string) => {
    const { activeTasks: aTasks, recentTasks: rTasks } = await window.electronAPI.removeRecentTask(taskId)
    setActiveTasks(aTasks)
    setRecentTasks(rTasks)
    const latestPending = aTasks.find((task: RecentTaskState) => task.status !== 'completed')
    setLastUrl(latestPending?.url || aTasks[0]?.url || null)
  }, [])

  const handleSaveConfig = useCallback(async (c: PodcastConfig) => {
    await window.electronAPI.saveConfig(c)
    setConfig(c)
    setToast('保存成功')
    setTimeout(() => setToast(null), 2000)
  }, [])

  const handleCleanTemp = useCallback(async () => {
    await window.electronAPI.cleanTemp()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem('podcast-theme', nextTheme)
      return nextTheme
    })
  }, [])

  return (
    <>
      <div className="workspace-shell">
        <WorkspaceSidebar 
          onSettings={() => setSettingsOpen(true)}
          onAbout={() => alert('播客笔记助手 v3.0\n\n小宇宙 → 下载 → Whisper → DeepSeek → Obsidian')}
        />
        <div className="workspace-main">
          <Header theme={theme} onToggleTheme={toggleTheme} status={feishuStatus} />
          <div className="workspace-body">
            <div className="workspace-main-column">
              <div className="workspace-content">
                <section className="workspace-hero">
                  <div className="workspace-hero__eyebrow">AI 播客工作区</div>
                  <div className="workspace-hero__header">
                    <div>
                      <h1 className="workspace-hero__title">欢迎回来</h1>
                      <p className="workspace-hero__description">
                        粘贴小宇宙链接后，应用会依次完成提取、下载、转写、校对和笔记整理。
                      </p>
                    </div>
                    <div className="workspace-hero__badge">{workflowStateLabel}</div>
                  </div>
                  {currentTitle && (
                    <div className="workspace-hero__meta">
                      <span className="workspace-hero__meta-label">当前节目</span>
                      <span className="workspace-hero__meta-value">{currentTitle}</span>
                    </div>
                  )}
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
                  />
                </section>
              </div>
            </div>
            <aside className="workspace-aside">
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                <ActiveTasksPanel tasks={activeTasks} onCancel={async () => { await window.electronAPI.cancelProcessing() }} />
                <RecentTasksPanel tasks={recentTasks} processing={processing || cancelling} onResume={handleTaskResume} onReplay={handleTaskReplay} onDelete={handleTaskDelete} />
              </div>
            </aside>
          </div>
        </div>
      </div>
      {settingsOpen && config && (
        <SettingsDialog
          config={config}
          onSave={handleSaveConfig}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--success)',
          color: 'var(--success)', padding: '10px 24px', borderRadius: 'var(--radius-md)',
          fontSize: 13, fontWeight: 600, zIndex: 2000,
          animation: 'toastIn 0.3s ease',
        }}>
          ✓ {toast}
        </div>
      )}
      <style>{`
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </>
  )
}
