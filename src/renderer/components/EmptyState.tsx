import type { JSX } from 'react'
import researchNotionMark from '../assets/research-notion-mark.svg'

type EmptyStateProps = {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true">
        <img src={researchNotionMark} alt="" />
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  )
}
