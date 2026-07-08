import type { JSX } from 'react'

type EmptyStateProps = {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state-mark">R</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  )
}
