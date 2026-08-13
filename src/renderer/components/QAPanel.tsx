import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, RotateCcw, MessageSquareText, User, Bot, Square } from 'lucide-react'
import NoteMarkdown from './NoteMarkdown'
import { useI18n } from '../i18n'
import { LINK_TYPE_COLORS } from './NoteMarkdown'

interface QASource {
  title: string
  path: string
  entityType?: string
}

interface QAItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: QASource[]
  error?: string
  streaming?: boolean
}

const ENTITY_TYPE_META: Record<string, { label: string; color: string }> = {
  人物: { label: '人物', color: LINK_TYPE_COLORS.people },
  项目: { label: '项目', color: LINK_TYPE_COLORS.projects },
  概念: { label: '概念', color: LINK_TYPE_COLORS.concepts },
  术语: { label: '术语', color: LINK_TYPE_COLORS.terms },
}

interface QAPanelProps {
  /** 来源点击回调（嵌入笔记库时用于在阅读器打开）；缺省用系统默认应用打开 */
  onOpenSource?: (source: QASource) => void
  /** 无笔记时「去处理播客」按钮回调（切换回工作台） */
  onGoProcess?: () => void
}

/**
 * 问答面板 — 与知识库对话（检索 + AI 总结 + 引用来源）
 */
export default function QAPanel({ onOpenSource, onGoProcess }: QAPanelProps) {
  const { t } = useI18n()
  const [items, setItems] = useState<QAItem[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [examples, setExamples] = useState<string[]>([])
  const [hasNotes, setHasNotes] = useState<boolean | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const requestIdRef = useRef(0)

  // 动态示例问题：基于笔记库高频实体（人物/概念/项目/术语），无笔记时用默认示例
  useEffect(() => {
    // 判断是否有笔记（决定空态展示引导还是示例）
    window.electronAPI
      .listNotes()
      .then(res => setHasNotes(!!res?.groups?.length))
      .catch(() => setHasNotes(true))
    window.electronAPI
      .getBacklinkIndex()
      .then(entries => {
        const top = (type: string) =>
          entries
            .filter(e => e.entityType === type)
            .sort((a, b) => b.podcastRefs.length - a.podcastRefs.length)[0]
        const person = top('people')
        const concept = top('concepts')
        const projOrTerm = top('projects') || top('terms')
        const list: string[] = []
        if (person) list.push(t('哪几期播客提到过{0}').replace('{0}', person.entityName))
        if (concept) list.push(t('我笔记里关于{0}的内容有哪些').replace('{0}', concept.entityName))
        if (projOrTerm) list.push(t('聊聊笔记里的{0}').replace('{0}', projOrTerm.entityName))
        const defaults = [
          t('我笔记里关于 AI 的内容有哪些'),
          t('哪几期播客提到过张一鸣'),
          t('总结一下我最近记录的科技趋势'),
        ]
        while (list.length < 3) {
          const next = defaults[list.length]
          if (!next || list.includes(next)) break
          list.push(next)
        }
        setExamples(list)
      })
      .catch(() => {
        setExamples([
          t('我笔记里关于 AI 的内容有哪些'),
          t('哪几期播客提到过张一鸣'),
          t('总结一下我最近记录的科技趋势'),
        ])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 订阅流式事件
  useEffect(() => {
    const offChunk = window.electronAPI.onQaChunk(({ requestId, text }) => {
      setItems(prev =>
        prev.map(item =>
          item.id === requestId ? { ...item, content: item.content + text } : item,
        ),
      )
    })
    const offDone = window.electronAPI.onQaDone(({ requestId, answer, sources }) => {
      setItems(prev =>
        prev.map(item =>
          item.id === requestId
            ? { ...item, content: answer, sources, streaming: false }
            : item,
        ),
      )
      setBusy(false)
    })
    const offError = window.electronAPI.onQaError(({ requestId, error, aborted }) => {
      setItems(prev =>
        prev.map(item =>
          item.id === requestId
            ? { ...item, error: aborted ? '' : error, streaming: false }
            : item,
        ),
      )
      setBusy(false)
    })
    return () => {
      offChunk()
      offDone()
      offError()
    }
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [items])

  const send = useCallback(() => {
    const question = input.trim()
    if (!question || busy) return
    const id = `qa-${++requestIdRef.current}`
    setItems(prev => [
      ...prev,
      { id: `u-${id}`, role: 'user', content: question },
      { id, role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setBusy(true)
    window.electronAPI.askQuestion(id, question).then(() => {
      /* 结果通过事件推送 */
    })
  }, [input, busy])

  const cancel = () => {
    const id = items.find(i => i.streaming)?.id
    if (id) window.electronAPI.cancelQuestion(id)
  }

  const reset = () => {
    setItems([])
    setBusy(false)
  }

  const openSource = (source: QASource) => {
    if (onOpenSource) {
      onOpenSource(source)
    } else {
      window.electronAPI.openPath(source.path)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="qa-panel">
      {/* 消息流 */}
      <div className="qa-panel__messages" ref={scrollRef}>
        {items.length === 0 ? (
          <div className="qa-panel__empty">
            <MessageSquareText size={26} />
            <div className="qa-panel__empty-title">{t('与你的知识库对话')}</div>
            <div className="qa-panel__empty-hint">{t('基于你生成的播客笔记回答，答案带引用来源')}</div>
            {hasNotes === false ? (
              <div className="qa-panel__empty-guide">
                <div className="qa-panel__empty-guide-text">
                  {t('你还没有任何笔记')}
                  <br />
                  {t('先处理一个播客，AI 转写并生成结构化笔记后，就可以向知识库提问了')}
                </div>
                {onGoProcess && (
                  <button className="qa-panel__empty-guide-btn" onClick={onGoProcess}>
                    {t('去处理播客')}
                  </button>
                )}
              </div>
            ) : (
              <div className="qa-panel__examples">
                {examples.map(ex => (
                  <button key={ex} className="qa-panel__example" onClick={() => setInput(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className={`qa-item qa-item--${item.role}`}>
              <div className="qa-item__avatar">
                {item.role === 'user' ? <User size={13} /> : <Bot size={13} />}
              </div>
              <div className="qa-item__body">
                {item.role === 'user' ? (
                  <div className="qa-item__user-text">{item.content}</div>
                ) : (
                  <>
                    {item.streaming && !item.content ? (
                      <div className="qa-item__thinking">
                        <Loader2 size={12} className="note-preview__spin" />
                        {t('检索笔记中...')}
                      </div>
                    ) : (
                      <>
                        {item.error ? (
                          <div className="qa-item__error">
                            {item.error}
                            <button className="qa-item__retry" onClick={send}>
                              <RotateCcw size={11} />
                              {t('重试')}
                            </button>
                          </div>
                        ) : (
                          <NoteMarkdown content={item.content} className="qa-item__answer" />
                        )}
                        {item.sources && item.sources.length > 0 && (
                          <div className="qa-item__sources">
                            <div className="qa-item__sources-label">{t('引用来源')}</div>
                            {item.sources.map((s, i) => {
                              const meta = s.entityType ? ENTITY_TYPE_META[s.entityType] : null
                              return (
                                <button
                                  key={i}
                                  className="qa-item__source"
                                  onClick={() => openSource(s)}
                                  title={s.path}
                                >
                                  {meta && (
                                    <span
                                      className="qa-item__source-type"
                                      style={{ color: meta.color, borderColor: meta.color }}
                                    >
                                      {meta.label}
                                    </span>
                                  )}
                                  <span className="qa-item__source-title">{s.title}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 输入区 */}
      <div className="qa-panel__inputbar">
        <textarea
          ref={inputRef}
          className="qa-panel__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('问你的知识库...（Enter 发送，Shift+Enter 换行）')}
          rows={2}
        />
        <div className="qa-panel__actions">
          {items.length > 0 && !busy && (
            <button className="qa-panel__btn qa-panel__btn--ghost" onClick={reset} title={t('清空对话')}>
              <RotateCcw size={13} />
            </button>
          )}
          {busy ? (
            <button className="qa-panel__btn qa-panel__btn--stop" onClick={cancel} title={t('停止')}>
              <Square size={12} />
            </button>
          ) : (
            <button
              className="qa-panel__btn qa-panel__btn--send"
              onClick={send}
              disabled={!input.trim()}
              title={t('发送')}
            >
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
