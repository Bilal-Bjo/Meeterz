import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ModelStatus } from '../types'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const [whisperOk, setWhisperOk] = useState(true)
  const [models, setModels] = useState<ModelStatus[]>([])
  const [live, setLive] = useState(true)
  const [theme, setTheme] = useState('system')
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    const info = await window.api.models.list()
    setWhisperOk(info.whisperInstalled)
    setModels(info.models)
  }

  useEffect(() => {
    refresh()
    window.api.settings.get('live_transcript', '1').then((v) => setLive(v === '1'))
    window.api.settings.get('theme', 'system').then(setTheme)
    return window.api.onModelProgress(({ file, progress }) => {
      setModels((prev) =>
        prev.map((m) => (m.file === file ? { ...m, downloading: progress < 1, progress } : m))
      )
      if (progress >= 1) refresh()
    })
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        {!whisperOk && (
          <div className="settings-warning">
            <strong>whisper-cli not found.</strong> Install it with{' '}
            <code>brew install whisper-cpp</code> — transcription won’t work without it.
          </div>
        )}

        <div className="settings-section">
          <div className="settings-label">Appearance</div>
          <div className="theme-row">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                className={`toggle-pill ${theme === t ? 'on' : ''}`}
                onClick={async () => {
                  setTheme(t)
                  await window.api.settings.set('theme', t)
                }}
              >
                {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Live transcript during recording</div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={live}
              onChange={async (e) => {
                setLive(e.target.checked)
                await window.api.settings.set('live_transcript', e.target.checked ? '1' : '0')
              }}
            />
            <span>Show the transcript while the meeting is still running (~15 s delay)</span>
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-label">Transcription model</div>
          <p className="settings-hint">
            Multilingual models auto-detect the language every ~30 seconds, so meetings that
            switch between Dutch, French and English are transcribed correctly.
          </p>
          {models.map((m) => (
            <div key={m.file} className="model-row">
              <label className="model-info">
                <input
                  type="radio"
                  name="model"
                  checked={m.active}
                  disabled={!m.installed}
                  onChange={async () => {
                    await window.api.models.setActive(m.file)
                    refresh()
                  }}
                />
                <span>
                  <span className="model-name">{m.label}</span>
                  <span className="model-size">{(m.sizeMb / 1000).toFixed(1)} GB</span>
                </span>
              </label>
              {m.installed ? (
                <span className="model-installed">Installed</span>
              ) : m.downloading ? (
                <span className="model-progress">
                  <span className="model-progress-bar" style={{ width: `${m.progress * 100}%` }} />
                  <span className="model-progress-text">{Math.round(m.progress * 100)}%</span>
                </span>
              ) : (
                <button
                  className="record-btn small"
                  onClick={() =>
                    window.api.models.download(m.file).catch((e) => setError(String(e?.message ?? e)))
                  }
                >
                  Download
                </button>
              )}
            </div>
          ))}
          {error && <p className="settings-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <span className="settings-hint">Global shortcut: ⌥⌘R starts/stops recording.</span>
          <button className="record-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
