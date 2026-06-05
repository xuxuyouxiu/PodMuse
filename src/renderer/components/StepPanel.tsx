import { StepInfo } from '@shared/types'
import { Search, Download, Mic, PenTool, Sparkles, Check, X, Loader2, Headphones, PartyPopper, Pause } from 'lucide-react'

interface Props {
  steps: StepInfo[]
  processing: boolean
}

const STEP_ICONS_LUCIDE = [Search, Download, Mic, PenTool, Sparkles]

export default function StepPanel({ steps, processing }: Props) {
  if (!processing && steps.every(s => s.status === 'pending')) {
    return (
      <div className="step-panel-card step-panel-card--idle" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: '32px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div className="step-panel-glow" style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 20% 50%, rgba(108,92,231,0.03), transparent 60%), radial-gradient(circle at 80% 50%, rgba(0,210,160,0.03), transparent 60%)',
          pointerEvents: 'none',
        }} />
        <div className="step-panel-empty step-panel-body--idle" style={{ textAlign: 'center', zIndex: 1 }}>
          <div className="step-panel-empty-icon" style={{ opacity: 0.55 }}>
            <Headphones size={48} />
          </div>
          <div className="step-panel-empty-title" style={{ fontSize: 'clamp(14px, 1.6vw, 15px)', fontWeight: 650, color: 'var(--text-primary)' }}>
            等待处理任务
          </div>
          <div className="step-panel-empty-text" style={{ fontSize: 'clamp(12px, 1.3vw, 13px)', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 260 }}>
            输入小宇宙链接或等待飞书消息
          </div>
        </div>
      </div>
    )
  }

  const currentStep = steps.find(s => s.status === 'running')
  const allDone = steps.every(s => s.status === 'done')
  const allStopped = steps.every(s => s.status === 'stopped')
  const hasError = steps.some(s => s.status === 'error')
  const showPaused = allStopped && !processing

  return (
    <div className="step-panel-card step-panel-card--active" style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      padding: '32px 40px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div className="step-panel-glow" style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 20% 50%, rgba(108,92,231,0.03), transparent 60%), radial-gradient(circle at 80% 50%, rgba(0,210,160,0.03), transparent 60%)',
        pointerEvents: 'none',
      }} />

      <div className="step-panel-body step-panel-body--active" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, zIndex: 1 }}>
        <div className="step-panel-header">
          <div>
            <div className="step-panel-eyebrow">流程面板</div>
            <div className="step-panel-title">当前处理阶段</div>
          </div>
          <div className="step-panel-counter">5 个步骤</div>
        </div>
        <div className="step-panel-track" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 0, justifyContent: 'center' }}>
          {steps.map((s, i) => (
            <div key={s.step} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <StepNode step={s} index={i} />
              {i < steps.length - 1 && (
                <Connector
                  status={s.status}
                  nextStatus={steps[i + 1].status}
                  allStopped={allStopped}
                />
              )}
            </div>
          ))}
        </div>

        {currentStep && (
          <div className="step-panel-summary" style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 22px',
            width: '100%',
            maxWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div className="step-panel-summary-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="step-panel-summary-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                {currentStep.title}
              </span>
              <span className="step-panel-summary-step" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                步骤 {currentStep.step}/5
              </span>
            </div>
            <div className="step-panel-summary-text" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {currentStep.detail || currentStep.subtitle}
            </div>
            {currentStep.progress != null && currentStep.status === 'running' && (
              <div className="step-panel-progress" style={{
                height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden',
              }}>
                <div className="step-panel-progress-value" style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
                  borderRadius: 2,
                  width: `${Math.max(currentStep.progress, 2)}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            )}
            {currentStep.status === 'running' && currentStep.progress != null && (
              <div className="step-panel-progress-label" style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                {currentStep.progress}%
              </div>
            )}
          </div>
        )}

        {!processing && allDone && (
          <div className="step-panel-state" style={{ textAlign: 'center' }}>
            <div className="step-panel-state-icon" style={{ marginBottom: 10, color: 'var(--success)' }}>
              <PartyPopper size={40} />
            </div>
            <div className="step-panel-state-title success" style={{ fontSize: 15, fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>
              笔记已保存到 Obsidian
            </div>
            <div className="step-panel-state-text" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              可在 Obsidian → 小宇宙播客 中查看
            </div>
          </div>
        )}

        {showPaused && (
          <div className="step-panel-state" style={{ textAlign: 'center' }}>
            <div className="step-panel-state-icon" style={{ marginBottom: 10, color: 'var(--accent)' }}>
              <Pause size={40} />
            </div>
            <div className="step-panel-state-title accent" style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
              处理已停止
            </div>
            <div className="step-panel-state-text" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              可以重新输入链接进行处理
            </div>
          </div>
        )}

        {!processing && hasError && (
          <div className="step-panel-state" style={{ textAlign: 'center' }}>
            <div className="step-panel-state-title error" style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>
              处理失败，请检查日志
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes nodePulse {
          0%, 100% { box-shadow: 0 0 16px rgba(108,92,231,0.35); }
          50% { box-shadow: 0 0 32px rgba(108,92,231,0.5), 0 0 64px rgba(108,92,231,0.2); }
        }
        @keyframes flow {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}

function StepNode({ step, index }: { step: StepInfo; index: number }) {
  const s = step.status
  return (
    <div className={`step-node step-node--${s}`} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 10, width: 'clamp(48px, 9vw, 72px)', minWidth: 0, textAlign: 'center', zIndex: 1,
    }}>
      <div className="step-node-badge" style={{
        width: 'clamp(34px, 5vw, 44px)', height: 'clamp(34px, 5vw, 44px)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'clamp(14px, 2vw, 18px)', transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        flexShrink: 0,
        ...(s === 'done' ? {
          background: 'rgba(0,210,160,0.12)',
          border: '2px solid var(--success)', color: 'var(--success)',
        } : s === 'running' ? {
          background: 'rgba(108,92,231,0.15)',
          border: '2px solid var(--accent)', color: 'var(--accent)',
          boxShadow: '0 0 24px var(--accent-glow)',
          animation: 'nodePulse 1.5s ease-in-out infinite',
        } : s === 'stopped' ? {
          background: 'rgba(108,92,231,0.12)',
          border: '2px solid var(--accent)', color: 'var(--accent)',
        } : s === 'error' ? {
          background: 'rgba(248,64,96,0.12)',
          border: '2px solid var(--error)', color: 'var(--error)',
        } : {
          background: 'transparent',
          border: '2px solid var(--border-light)', color: 'var(--text-muted)',
        }),
      }}>
        {s === 'done' ? <Check size={18} /> : s === 'error' ? <X size={18} /> : s === 'running' ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          (() => {
            const IconComp = STEP_ICONS_LUCIDE[index]
            return <IconComp size={16} />
          })()
        )}
      </div>
      <span className="step-node-label" style={{
        fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 500, lineHeight: 1.3,
        transition: 'color 0.4s',
        color: s === 'running' ? 'var(--accent)' : s === 'done' ? 'var(--success)'
          : s === 'stopped' ? 'var(--accent)' : s === 'error' ? 'var(--error)' : 'var(--text-muted)',
      }}>
        {step.title}
      </span>
    </div>
  )
}

function Connector({ status, nextStatus, allStopped }: {
  status: StepInfo['status']
  nextStatus: StepInfo['status']
  allStopped: boolean
}) {
  const isDone = status === 'done'
  const isStopped = status === 'stopped'
  const isActive = isDone && nextStatus === 'running'
  return (
    <div className={`step-connector${isActive ? ' is-active' : ''}`} style={{
      width: 'clamp(10px, 3vw, 32px)', minWidth: 'clamp(10px, 3vw, 32px)', height: 2, borderRadius: 1, margin: '0 2px',
      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative', overflow: 'hidden',
      background: isActive ? 'var(--border-light)'
        : isDone ? 'var(--success)'
        : allStopped ? 'var(--accent)'
        : isStopped ? 'var(--accent)'
        : 'var(--border-light)',
    }}>
      {isActive && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
          animation: 'flow 0.8s linear infinite',
        }} />
      )}
    </div>
  )
}
