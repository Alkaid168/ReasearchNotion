import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { CheckCircle2, Database, FileText, Folder, KeyRound, Loader2, MessageSquare, Plug, RefreshCw, Save, Server, XCircle } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import type { ConnectionTestResult, EnvironmentStatus } from '../../shared/ipcTypes'
import type { AppSettings } from '../../shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
  deepseekApiKey: '',
  defaultFolderId: null
}

type Notice = {
  tone: 'success' | 'error' | 'neutral'
  message: string
}

type SettingsPageProps = {
  onSettingsSaved?: (settings: AppSettings) => void
  onConnectionTested?: (result: ConnectionTestResult) => void
}

export function SettingsPage({ onSettingsSaved, onConnectionTested }: SettingsPageProps = {}): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(emptySettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [refreshingStatus, setRefreshingStatus] = useState(false)
  const [environmentStatus, setEnvironmentStatus] = useState<EnvironmentStatus | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let alive = true

    void Promise.all([desktopApi.settings.get(), desktopApi.app.getEnvironmentStatus()])
      .then(([storedSettings, status]) => {
        if (!alive) return
        setSettings(storedSettings)
        setEnvironmentStatus(status)
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
      setEnvironmentStatus(await desktopApi.app.getEnvironmentStatus())
      setNotice({ tone: 'success', message: '设置已保存。' })
      onSettingsSaved?.(savedSettings)
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
      onConnectionTested?.(result)
    } catch {
      setNotice({ tone: 'error', message: '连接测试失败。' })
    } finally {
      setTesting(false)
    }
  }

  async function refreshEnvironmentStatus(): Promise<void> {
    setRefreshingStatus(true)
    try {
      setEnvironmentStatus(await desktopApi.app.getEnvironmentStatus())
    } finally {
      setRefreshingStatus(false)
    }
  }

  return (
    <main className="settings-page">
      <section className="settings-header">
        <div>
          <span className="settings-kicker">本地 Dify</span>
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

        <label className="settings-field">
          <span>
            <KeyRound size={16} aria-hidden="true" />
            DeepSeek API Key（模型密钥，保存时自动同步到 Dify）
          </span>
          <input
            value={settings.deepseekApiKey}
            onChange={(event) => updateField('deepseekApiKey', event.target.value)}
            placeholder="sk-..."
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

      <section className="settings-status-panel" aria-label="本地状态">
        <div className="settings-status-head">
          <div>
            <span className="settings-kicker">本地状态</span>
            <h2>本地状态</h2>
          </div>
          <button className="secondary-action compact" type="button" onClick={() => void refreshEnvironmentStatus()} disabled={refreshingStatus}>
            {refreshingStatus ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            刷新
          </button>
        </div>

        <div className="settings-status-grid">
          <div className="settings-status-card">
            <Plug size={16} aria-hidden="true" />
            <span>Dify</span>
            <strong>{environmentStatus?.difyConfigured ? '已配置' : '未配置'}</strong>
          </div>
          <div className="settings-status-card">
            <Folder size={16} aria-hidden="true" />
            <span>论文库</span>
            <strong>{environmentStatus?.folderCount ?? '-'}</strong>
          </div>
          <div className="settings-status-card">
            <FileText size={16} aria-hidden="true" />
            <span>论文</span>
            <strong>{environmentStatus?.paperCount ?? '-'}</strong>
          </div>
          <div className="settings-status-card">
            <FileText size={16} aria-hidden="true" />
            <span>PDF</span>
            <strong>{environmentStatus?.pdfPaperCount ?? '-'}</strong>
          </div>
          <div className="settings-status-card">
            <Database size={16} aria-hidden="true" />
            <span>已索引</span>
            <strong>{environmentStatus?.indexedPaperCount ?? '-'}</strong>
          </div>
          <div className="settings-status-card">
            <Database size={16} aria-hidden="true" />
            <span>论文卡片</span>
            <strong>{environmentStatus?.cardCount ?? '-'}</strong>
          </div>
          <div className="settings-status-card">
            <MessageSquare size={16} aria-hidden="true" />
            <span>对话</span>
            <strong>{environmentStatus?.conversationCount ?? '-'}</strong>
          </div>
        </div>

      </section>
    </main>
  )
}
