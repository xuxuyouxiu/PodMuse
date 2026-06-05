import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('React Error Boundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: '#11111b', color: '#cdd6f4', fontFamily: 'sans-serif', padding: 40,
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>应用加载失败</div>
          <div style={{
            fontSize: 13, color: '#f87171', background: 'rgba(248,113,113,0.1)',
            padding: '12px 20px', borderRadius: 8, maxWidth: 500, wordBreak: 'break-all',
          }}>
            {this.state.error.message}
          </div>
          <div style={{
            fontSize: 12, color: '#6c7086', background: '#1e1e2e',
            padding: '12px 20px', borderRadius: 8, maxWidth: 500, maxHeight: 200, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {this.state.error.stack}
          </div>
          <button onClick={() => this.setState({ error: null })} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none',
            background: '#3b82f6', color: '#fff', fontSize: 14, cursor: 'pointer',
          }}>
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
