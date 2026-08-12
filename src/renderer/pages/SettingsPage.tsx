import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { Brain, CheckCircle2, Database, Eye, EyeOff, FileText, Folder, KeyRound, Loader2, MessageSquare, Pencil, Plug, Plus, RefreshCw, Save, Server, Trash2, X, XCircle, Zap } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import type { ConnectionTestResult, EnvironmentStatus } from '../../shared/ipcTypes'
import type { AppSettings, ModelProfile, ModelProfileInput, ModelProvider, UserMemory, UserMemoryInput, UserMemoryType } from '../../shared/types'
import { MODEL_PROVIDER_ORDER, MODEL_PROVIDER_PRESETS } from '../../shared/modelPresets'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
  deepseekApiKey: '',
  defaultFolderId: null,
  activeModelProfileId: null
}

type SecretInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

function SecretInput({ value, onChange, placeholder, disabled }: SecretInputProps): JSX.Element {
  const [visible, setVisible] = useState(false)
  return (
    <div className="secret-input">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="secret-toggle"
        aria-label={visible ? '隐藏' : '显示'}
        title={visible ? '隐藏' : '显示'}
        onClick={() => setVisible((current) => !current)}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
      </button>
    </div>
  )
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
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([])
  const [editingProfile, setEditingProfile] = useState<ModelProfileInput | null>(null)

  useEffect(() => {
    let alive = true

    void Promise.all([desktopApi.settings.get(), desktopApi.app.getEnvironmentStatus(), desktopApi.memories.list(), desktopApi.modelProfiles.list()])
      .then(([storedSettings, status, storedMemories, storedProfiles]) => {
        if (!alive) return
        setSettings(storedSettings)
        setEnvironmentStatus(status)
        setMemories(storedMemories)
        setModelProfiles(storedProfiles)
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

  async function saveModelProfileInput(input: ModelProfileInput): Promise<void> {
    const saved = await desktopApi.modelProfiles.save(input)
    setModelProfiles(await desktopApi.modelProfiles.list())
    setEditingProfile(null)
    setNotice({ tone: 'success', message: `模型档「${saved.displayName}」已保存。` })
  }

  async function deleteModelProfile(id: string): Promise<void> {
    await desktopApi.modelProfiles.delete(id)
    setModelProfiles(await desktopApi.modelProfiles.list())
    const updated = await desktopApi.settings.get()
    setSettings(updated)
    setNotice({ tone: 'neutral', message: '模型档已删除。' })
  }

  async function activateModelProfile(id: string): Promise<void> {
    await desktopApi.modelProfiles.setActive(id)
    setModelProfiles(await desktopApi.modelProfiles.list())
    const updated = await desktopApi.settings.get()
    setSettings(updated)
    setNotice({ tone: 'success', message: '已切换默认模型，新对话将使用此模型。' })
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
          <SecretInput
            value={settings.difyAppApiKey}
            onChange={(value) => updateField('difyAppApiKey', value)}
            placeholder="app-..."
            disabled={loading}
          />
        </label>

        <label className="settings-field">
          <span>
            <KeyRound size={16} aria-hidden="true" />
            Dify Knowledge API Key（论文归档同步，可选）
          </span>
          <SecretInput
            value={settings.difyKnowledgeApiKey}
            onChange={(value) => updateField('difyKnowledgeApiKey', value)}
            placeholder="dataset-..."
            disabled={loading}
          />
        </label>

        <label className="settings-field">
          <span>
            <KeyRound size={16} aria-hidden="true" />
            DeepSeek API Key（模型密钥，保存时自动同步到 Dify）
          </span>
          <SecretInput
            value={settings.deepseekApiKey}
            onChange={(value) => updateField('deepseekApiKey', value)}
            placeholder="sk-..."
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

      <div className="settings-app-mode">
        <span className="settings-field-label">
          <Zap size={16} aria-hidden="true" />
          AI 引擎
        </span>
        <div className="settings-app-mode-buttons">
          <div className="settings-mode-btn active" aria-label="当前 AI 引擎为 Tool Agent">
            <Brain size={15} aria-hidden="true" />
            <div>
              <strong>Tool Agent</strong>
              <small>本地论文取证 · 外网搜索 · 自主多轮 · 长期记忆</small>
            </div>
          </div>
        </div>
        <p className="settings-app-mode-hint">
          ResearchNotion 只使用 Tool Agent。它会按问题自主读取本地论文、调用检索工具，并在需要时查询公开学术资源。
        </p>
      </div>

      <section className="settings-status-panel" aria-label="模型档">
        <div className="settings-status-head">
          <div>
            <span className="settings-kicker">模型档</span>
            <h2>模型档</h2>
          </div>
        </div>
        <p className="settings-app-mode-hint">
          每个模型档对应一个 Dify Tool Agent 应用（不同厂商或同厂商不同模型）。切换后新对话使用所选模型。仅支持 DeepSeek / 通义千问 / 智谱。需先在 Dify 控制台为对应模型创建 agent 应用，再将其 App API Key 填入此处。
        </p>

        {editingProfile ? (
          <ModelProfileEditor input={editingProfile} onCancel={() => setEditingProfile(null)} onSave={(input) => void saveModelProfileInput(input)} />
        ) : null}

        {MODEL_PROVIDER_ORDER.map((provider) => {
          const presets = MODEL_PROVIDER_PRESETS[provider]
          const profiles = modelProfiles.filter((profile) => profile.provider === provider)
          return (
            <div key={provider} className="settings-model-provider-group">
              <div className="settings-model-provider-head">
                <strong>{presets.label}</strong>
                <button
                  className="secondary-action compact"
                  type="button"
                  onClick={() =>
                    setEditingProfile({
                      provider,
                      modelName: presets.models[0].name,
                      displayName: presets.models[0].label,
                      difyAppApiKey: '',
                      contextWindowTokens: presets.models[0].contextWindow
                    })
                  }
                >
                  <Plus size={14} aria-hidden="true" />
                  添加
                </button>
              </div>
              {profiles.length === 0 ? (
                <p className="settings-model-empty">尚未配置该厂商的模型档。</p>
              ) : (
                <div className="settings-model-list">
                  {profiles.map((profile) => (
                    <div key={profile.id} className={`settings-model-card ${profile.isActive ? 'active' : ''}`}>
                      <div className="settings-model-info">
                        <span className={`settings-model-dot ${profile.isActive ? 'on' : ''}`} aria-hidden="true" />
                        <div>
                          <strong>{profile.displayName}</strong>
                          <small>
                            {profile.modelName} · {(profile.contextWindowTokens / 1000).toFixed(0)}k 上下文
                          </small>
                        </div>
                      </div>
                      <div className="settings-model-actions">
                        {profile.isActive ? (
                          <span className="settings-model-active-tag">当前默认</span>
                        ) : (
                          <button className="secondary-action compact" type="button" onClick={() => void activateModelProfile(profile.id)}>
                            设为默认
                          </button>
                        )}
                        <button
                          className="secondary-action compact"
                          type="button"
                          onClick={() =>
                            setEditingProfile({
                              id: profile.id,
                              provider: profile.provider,
                              modelName: profile.modelName,
                              displayName: profile.displayName,
                              difyAppApiKey: profile.difyAppApiKey,
                              contextWindowTokens: profile.contextWindowTokens
                            })
                          }
                        >
                          <Pencil size={13} aria-hidden="true" />
                          编辑
                        </button>
                        <button className="secondary-action compact danger" type="button" onClick={() => void deleteModelProfile(profile.id)}>
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>

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

type ModelProfileEditorProps = {
  input: ModelProfileInput
  onSave: (input: ModelProfileInput) => void
  onCancel: () => void
}

function ModelProfileEditor({ input, onSave, onCancel }: ModelProfileEditorProps): JSX.Element {
  const [provider, setProvider] = useState<ModelProvider>(input.provider)
  const [modelName, setModelName] = useState(input.modelName)
  const [displayName, setDisplayName] = useState(input.displayName)
  const [difyAppApiKey, setDifyAppApiKey] = useState(input.difyAppApiKey)
  const [contextWindowTokens, setContextWindowTokens] = useState(input.contextWindowTokens)

  const presets = MODEL_PROVIDER_PRESETS[provider]

  function handleProviderChange(next: ModelProvider): void {
    setProvider(next)
    const first = MODEL_PROVIDER_PRESETS[next].models[0]
    setModelName(first.name)
    setDisplayName(first.label)
    setContextWindowTokens(first.contextWindow)
  }

  function handleModelChange(name: string): void {
    setModelName(name)
    const model = presets.models.find((entry) => entry.name === name)
    if (model) {
      setDisplayName(model.label)
      setContextWindowTokens(model.contextWindow)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSave({
      id: input.id,
      provider,
      modelName: modelName.trim(),
      displayName: displayName.trim(),
      difyAppApiKey: difyAppApiKey.trim(),
      contextWindowTokens
    })
  }

  return (
    <form className="settings-memory-editor" onSubmit={handleSubmit}>
      <label className="settings-field">
        <span><Brain size={16} aria-hidden="true" /> 厂商</span>
        <select value={provider} onChange={(event) => handleProviderChange(event.target.value as ModelProvider)} className="settings-memory-select">
          {MODEL_PROVIDER_ORDER.map((entry) => (
            <option key={entry} value={entry}>
              {MODEL_PROVIDER_PRESETS[entry].label}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        <span>模型</span>
        <select value={modelName} onChange={(event) => handleModelChange(event.target.value)} className="settings-memory-select">
          {presets.models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.label}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        <span>显示名</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="如 DeepSeek Chat" />
      </label>
      <label className="settings-field">
        <span><KeyRound size={16} aria-hidden="true" /> Dify App API Key</span>
        <SecretInput value={difyAppApiKey} onChange={setDifyAppApiKey} placeholder="app-..." />
      </label>
      <label className="settings-field">
        <span>上下文窗口（tokens）</span>
        <input
          type="number"
          value={contextWindowTokens}
          onChange={(event) => setContextWindowTokens(Number(event.target.value))}
          min={1000}
          step={1000}
        />
      </label>
      <div className="settings-actions">
        <button className="secondary-action" type="button" onClick={onCancel}>
          <X size={16} aria-hidden="true" />
          取消
        </button>
        <button className="primary-action" type="submit" disabled={!displayName.trim() || !difyAppApiKey.trim()}>
          <Save size={16} aria-hidden="true" />
          保存模型档
        </button>
      </div>
    </form>
  )
}
