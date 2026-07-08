import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { CheckCircle2, KeyRound, Loader2, Plug, Save, Server, XCircle } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import type { AppSettings } from '../../shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
  defaultFolderId: null
}

type Notice = {
  tone: 'success' | 'error' | 'neutral'
  message: string
}

export function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(emptySettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let alive = true

    void desktopApi.settings
      .get()
      .then((storedSettings) => {
        if (!alive) return
        setSettings(storedSettings)
        setNotice(null)
      })
      .catch(() => {
        if (!alive) return
        setNotice({ tone: 'error', message: '读取设置失败。' })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  function updateField(field: keyof AppSettings, value: string): void {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const savedSettings = await desktopApi.settings.save(settings)
      setSettings(savedSettings)
      setNotice({ tone: 'success', message: '设置已保存。' })
    } catch {
      setNotice({ tone: 'error', message: '保存设置失败。' })
    } finally {
      setSaving(false)
    }
  }

  async function testConnection(): Promise<void> {
    setTesting(true)
    setNotice(null)
    try {
      const result = await desktopApi.settings.testConnection(settings)
      setNotice({ tone: result.ok ? 'success' : 'error', message: result.message })
    } catch {
      setNotice({ tone: 'error', message: '连接测试失败。' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <main className="settings-page">
      <section className="settings-header">
        <div>
          <span className="settings-kicker">Local Dify</span>
          <h1>连接 Dify</h1>
        </div>
        <div className={notice ? `settings-notice ${notice.tone}` : 'settings-notice neutral'}>
          {notice?.tone === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : null}
          {notice?.tone === 'error' ? <XCircle size={16} aria-hidden="true" /> : null}
          {!notice || notice.tone === 'neutral' ? <Plug size={16} aria-hidden="true" /> : null}
          <span>{notice?.message ?? (loading ? '正在读取本地配置...' : '配置保存在本机。')}</span>
        </div>
      </section>

      <form className="settings-form" onSubmit={(event) => void save(event)}>
        <label className="settings-field">
          <span>
            <Server size={16} aria-hidden="true" />
            Dify 服务地址
          </span>
          <input
            value={settings.difyBaseUrl}
            onChange={(event) => updateField('difyBaseUrl', event.target.value)}
            placeholder="http://localhost:8080"
            disabled={loading}
          />
        </label>

        <label className="settings-field">
          <span>
            <KeyRound size={16} aria-hidden="true" />
            Dify App API Key
          </span>
          <input
            value={settings.difyAppApiKey}
            onChange={(event) => updateField('difyAppApiKey', event.target.value)}
            placeholder="app-..."
            type="password"
            disabled={loading}
          />
        </label>

        <label className="settings-field">
          <span>
            <KeyRound size={16} aria-hidden="true" />
            Dify Knowledge API Key
          </span>
          <input
            value={settings.difyKnowledgeApiKey}
            onChange={(event) => updateField('difyKnowledgeApiKey', event.target.value)}
            placeholder="dataset-..."
            type="password"
            disabled={loading}
          />
        </label>

        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={() => void testConnection()} disabled={loading || testing}>
            {testing ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Plug size={16} aria-hidden="true" />}
            测试连接
          </button>
          <button className="primary-action" type="submit" disabled={loading || saving}>
            {saving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            保存设置
          </button>
        </div>
      </form>
    </main>
  )
}
