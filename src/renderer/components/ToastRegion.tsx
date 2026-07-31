import { useEffect, type JSX } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

export type ToastItem = {
  id: string
  message: string
  tone: 'success' | 'error'
}

type ToastRegionProps = {
  items: ToastItem[]
  onDismiss: (id: string) => void
}

export function ToastRegion({ items, onDismiss }: ToastRegionProps): JSX.Element | null {
  useEffect(() => {
    if (items.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss(items[items.length - 1].id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, onDismiss])

  if (items.length === 0) return null

  return (
    <section className="toast-region" aria-label="操作通知" aria-live="polite">
      {items.map((item) => {
        const Icon = item.tone === 'success' ? CheckCircle2 : CircleAlert
        return (
          <div key={item.id} className={`toast-item ${item.tone}`} role="status">
            <Icon size={16} aria-hidden="true" />
            <span>{item.message}</span>
            <button type="button" aria-label="关闭通知" onClick={() => onDismiss(item.id)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </section>
  )
}
