import { Component, type ErrorInfo, type ReactNode } from 'react'

type RendererErrorBoundaryProps = {
  children: ReactNode
}

type RendererErrorBoundaryState = {
  error: Error | null
}

export class RendererErrorBoundary extends Component<RendererErrorBoundaryProps, RendererErrorBoundaryState> {
  state: RendererErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ResearchNotion renderer failed to start.', error, info.componentStack)
  }

  private reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <main className="renderer-error-screen" role="alert">
        <section className="renderer-error-card">
          <p className="renderer-error-eyebrow">ResearchNotion 启动失败</p>
          <h1>页面加载时遇到错误</h1>
          <p>应用数据没有被删除。请复制下方错误信息，或重新加载页面后再试。</p>
          <pre>{this.state.error.message || this.state.error.name}</pre>
          <button type="button" onClick={this.reload}>重新加载</button>
        </section>
      </main>
    )
  }
}
