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
      <div className="step-panel-card step-panel-card--idle">
        <div className="step-panel-glow" />
        <div className="step-panel-empty step-panel-body--idle">
          <div className="step-panel-empty-icon">
            <Headphones size={48} />
          </div>
          <div className="step-panel-empty-title">
            等待处理任务
          </div>
          <div className="step-panel-empty-text">
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
    <div className="step-panel-card step-panel-card--active">
      <div className="step-panel-glow" />

      <div className="step-panel-body step-panel-body--active">
        <div className="step-panel-header">
          <div>
            <div className="step-panel-eyebrow">流程面板</div>
            <div className="step-panel-title">当前处理阶段</div>
          </div>
          <div className="step-panel-counter">5 个步骤</div>
        </div>
        <div className="step-panel-track">
          {steps.map((s, i) => (
            <div key={s.step} className="step-panel-track-item">
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
          <div className="step-panel-summary">
            <div className="step-panel-summary-header">
              <span className="step-panel-summary-title">
                {currentStep.title}
              </span>
              <span className="step-panel-summary-step">
                步骤 {currentStep.step}/5
              </span>
            </div>
            <div className="step-panel-summary-text">
              {currentStep.detail || currentStep.subtitle}
            </div>
            {currentStep.progress != null && currentStep.status === 'running' && (
              <div className="step-panel-progress">
                <div
                  className="step-panel-progress-value"
                  style={{ width: `${Math.max(currentStep.progress, 2)}%` }}
                />
              </div>
            )}
            {currentStep.status === 'running' && currentStep.progress != null && (
              <div className="step-panel-progress-label">
                {currentStep.progress}%
              </div>
            )}
          </div>
        )}

        {!processing && allDone && (
          <div className="step-panel-state">
            <div className="step-panel-state-icon step-panel-state-icon--success">
              <PartyPopper size={40} />
            </div>
            <div className="step-panel-state-title success">
              笔记已保存到 Obsidian
            </div>
            <div className="step-panel-state-text">
              可在 Obsidian → 小宇宙播客 中查看
            </div>
          </div>
        )}

        {showPaused && (
          <div className="step-panel-state">
            <div className="step-panel-state-icon step-panel-state-icon--accent">
              <Pause size={40} />
            </div>
            <div className="step-panel-state-title accent">
              处理已停止
            </div>
            <div className="step-panel-state-text">
              可以重新输入链接进行处理
            </div>
          </div>
        )}

        {!processing && hasError && (
          <div className="step-panel-state">
            <div className="step-panel-state-title error">
              处理失败，请检查日志
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepNode({ step, index }: { step: StepInfo; index: number }) {
  const s = step.status
  return (
    <div className={`step-node step-node--${s}`}>
      <div className={`step-node-badge step-node-badge--${s}`}>
        {s === 'done' ? <Check size={18} /> : s === 'error' ? <X size={18} /> : s === 'running' ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          (() => {
            const IconComp = STEP_ICONS_LUCIDE[index]
            return <IconComp size={16} />
          })()
        )}
      </div>
      <span className={`step-node-label step-node-label--${s}`}>
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

  const bg = isActive ? 'var(--border-light)'
    : isDone ? 'var(--success)'
    : allStopped ? 'var(--accent)'
    : isStopped ? 'var(--accent)'
    : 'var(--border-light)'

  return (
    <div
      className={`step-connector${isActive ? ' is-active' : ''}`}
      style={{ background: bg }}
    >
      {isActive && (
        <div className="step-connector-flow" />
      )}
    </div>
  )
}
