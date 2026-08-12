import { useEffect, useRef, useState, type JSX } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { ModelProfile } from '../../shared/types'
import { MODEL_PROVIDER_LABELS, MODEL_PROVIDER_ORDER } from '../../shared/modelPresets'

type ModelSelectorProps = {
  profiles: ModelProfile[]
  activeProfile: ModelProfile | null
  onActivate: (id: string) => void | Promise<void>
}

/** Composer 顶部的模型档选择器。点击展开下拉，按厂商分组列出，切换后调用 onActivate。 */
export function ModelSelector({ profiles, activeProfile, onActivate }: ModelSelectorProps): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  if (profiles.length === 0) return null

  return (
    <div className="model-selector" ref={containerRef}>
      <button
        type="button"
        className="model-selector-chip"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={activeProfile ? `当前模型：${activeProfile.displayName}` : '选择模型'}
      >
        <span className="model-selector-label">{activeProfile?.displayName ?? '选择模型'}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div className="model-selector-dropdown" role="listbox">
          {MODEL_PROVIDER_ORDER.map((provider) => {
            const grouped = profiles.filter((profile) => profile.provider === provider)
            if (grouped.length === 0) return null
            return (
              <div key={provider} className="model-selector-group">
                <div className="model-selector-group-label">{MODEL_PROVIDER_LABELS[provider]}</div>
                {grouped.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className={`model-selector-option ${profile.isActive ? 'active' : ''}`}
                    role="option"
                    aria-selected={profile.isActive}
                    onClick={() => {
                      setOpen(false)
                      if (!profile.isActive) void onActivate(profile.id)
                    }}
                  >
                    <span>
                      <strong>{profile.displayName}</strong>
                      <small>{profile.modelName}</small>
                    </span>
                    {profile.isActive ? <Check size={14} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
