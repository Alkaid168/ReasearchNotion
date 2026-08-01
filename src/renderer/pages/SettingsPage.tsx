import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { Brain, CheckCircle2, Database, FileText, Folder, KeyRound, Loader2, MessageSquare, Pencil, Plug, Plus, RefreshCw, Save, Server, Trash2, X, XCircle } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import type { ConnectionTestResult, EnvironmentStatus } from '../../shared/ipcTypes'
import type { AppSettings, UserMemory, UserMemoryInput, UserMemoryType } from '../../shared/types'

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
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [editingMemory, setEditingMemory] = useState<UserMemoryInput | null>(null)

  useEffect(() => {
    let alive = true

    void Promise.all([desktopApi.settings.get(), desktopApi.app.getEnvironmentStatus(), desktopApi.memories.list()])
      .then(([storedSettings, status, storedMemories]) => {
        if (!alive) return
        setSettings(storedSettings)
        setEnvironmentStatus(status)
        setMemories(storedMemories)
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

  async function saveMemory(input: UserMemoryInput): Promise<void> {
    const saved = await desktopApi.memories.save(input)
    setMemories(await desktopApi.memories.list())
    setEditingMemory(null)
    setNotice({ tone: 'success', message: `记忆「${saved.name}」已保存。` })
  }

  async function deleteMemory(id: string): Promise<void> {
    await desktopApi.memories.delete(id)
    setMemories(await desktopApi.memories.list())
    setNotice({ tone: 'neutral', message: '记忆已删除。' })
  }

  const memoryTypeLabels: Record<UserMemoryType, string> = {
    user: '身份',
    preference: '偏好',
    feedback: '纠正',
    project: '课题',
    reference: '资源'
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

      <section className="settings-status-panel" aria-label="研究偏好">
        <div className="settings-status-head">
          <div>
            <span className="settings-kicker">用户记忆</span>
            <h2>研究偏好</h2>
          </div>
          <button
            className="secondary-action compact"
            type="button"
            onClick={() => setEditingMemory({ type: 'user', name: '', description: '', body: '' })}
          >
            <Plus size={15} aria-hidden="true" />
            添加记忆
          </button>
        </div>

        {editingMemory ? (
          <MemoryEditor
            input={editingMemory}
            onCancel={() => setEditingMemory(null)}
            onSave={(input) => void saveMemory(input)}
          />
        ) : null}

        {memories.length === 0 && !editingMemory ? (
          <p className="settings-memories-empty">
            还没有保存任何研究偏好。添加后，Agent 将在每次对话中记住你的研究方向、回答偏好和常用纠正。
          </p>
        ) : null}

        <div className="settings-memories-list">
          {memories.map((mem) => (
            <div key={mem.id} className="settings-memory-card">
              <div className="settings-memory-head">
                <span className={`settings-memory-badge ${mem.type}`}>{memoryTypeLabels[mem.type]}</span>
                <strong>{mem.name}</strong>
                {mem.description ? <span className="settings-memory-desc">{mem.description}</span> : null}
              </div>
              <p className="settings-memory-body">{mem.body}</p>
              <div className="settings-memory-actions">
                <button className="secondary-action compact" type="button" onClick={() => setEditingMemory({ id: mem.id, type: mem.type, name: mem.name, description: mem.description, body: mem.body })}>
                  <Pencil size={13} aria-hidden="true" />
                  编辑
                </button>
                <button className="secondary-action compact danger" type="button" onClick={() => void deleteMemory(mem.id)}>
                  <Trash2 size={13} aria-hidden="true" />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

type MemoryEditorProps = {
  input: UserMemoryInput
  onSave: (input: UserMemoryInput) => void
  onCancel: () => void
}

function MemoryEditor({ input, onSave, onCancel }: MemoryEditorProps): JSX.Element {
  const [type, setType] = useState<UserMemoryType>(input.type)
  const [name, setName] = useState(input.name)
  const [description, setDescription] = useState(input.description)
  const [body, setBody] = useState(input.body)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSave({ id: input.id, type, name: name.trim(), description: description.trim(), body: body.trim() })
  }

  return (
    <form className="settings-memory-editor" onSubmit={handleSubmit}>
      <label className="settings-field">
        <span><Brain size={16} aria-hidden="true" /> 类型</span>
        <select value={type} onChange={(e) => setType(e.target.value as UserMemoryType)} className="settings-memory-select">
          <option value="user">身份（角色、研究方向、母语）</option>
          <option value="preference">偏好（回答语言、写作风格、术语）</option>
          <option value="feedback">纠正（用户纠正过的行为）</option>
          <option value="project">课题（当前研究、活跃论文库）</option>
          <option value="reference">资源（arXiv 收藏、外部链接）</option>
        </select>
      </label>
      <label className="settings-field">
        <span>名称（简短标识）</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 research-field" />
      </label>
      <label className="settings-field">
        <span>描述（可选，一句话）</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="如 用户的研究方向" />
      </label>
      <label className="settings-field">
        <span>内容</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="如 NLP 方向硕士生，母语中文，偏好学术正式风格的回答"
          rows={3}
          className="settings-memory-textarea"
        />
      </label>
      <div className="settings-actions">
        <button className="secondary-action" type="button" onClick={onCancel}>
          <X size={16} aria-hidden="true" />
          取消
        </button>
        <button className="primary-action" type="submit" disabled={!name.trim() || !body.trim()}>
          <Save size={16} aria-hidden="true" />
          保存记忆
        </button>
      </div>
    </form>
  )
}
