import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ModelStatus } from '../types'

interface SettingsModalProps {
  onClose: () => void
}

function PermBadge({ state }: { state: 'ok' | 'bad' | 'unknown' }): JSX.Element {
  const label = state === 'ok' ? 'Granted' : state === 'bad' ? 'Not granted' : 'Not tested'
  return <span className={`perm-badge ${state}`}>{label}</span>
}

export function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const [whisperOk, setWhisperOk] = useState(true)
  const [models, setModels] = useState<ModelStatus[]>([])
  const [live, setLive] = useState(true)
  const [theme, setTheme] = useState('system')
  const [error, setError] = useState<string | null>(null)
  const [micStatus, setMicStatus] = useState<string>('unknown')
  const [sysAudio, setSysAudio] = useState<'untested' | 'testing' | 'working' | 'failed'>(
    'untested'
  )

  const refreshMic = async (): Promise<void> => {
    const p = await window.api.permissions.status()
    setMicStatus(p.microphone)
  }

  // Triggers the real macOS mic prompt. Crucially this also REGISTERS Meeterz
  // in System Settings › Microphone — an app only appears there once it has
  // actually requested access. askForMediaAccess (main) prompts when the
  // status is undetermined; a renderer getUserMedia is the belt-and-braces
  // path that reliably registers the app even when already denied.
  const grantMic = async (): Promise<void> => {
    try {
      await window.api.permissions.requestMic()
    } catch {
      /* ignore */
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* denied — the app is now listed so the user can toggle it on */
    }
    await refreshMic()
    // If still not granted, open the pane — Meeterz is now in the list.
    const p = await window.api.permissions.status()
    if (p.microphone !== 'granted') window.api.permissions.openPane('microphone')
  }

  // No query API exists for the "System Audio Recording" permission, so we
  // test it for real: attempt a loopback capture and confirm audio flows.
  const testSystemAudio = async (): Promise<void> => {
    setSysAudio('testing')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false })
      const ok = stream.getAudioTracks().length > 0
      stream.getTracks().forEach((t) => t.stop())
      setSysAudio(ok ? 'working' : 'failed')
    } catch {
      setSysAudio('failed')
    }
  }

  const refresh = async (): Promise<void> => {
    const info = await window.api.models.list()
    setWhisperOk(info.whisperInstalled)
    setModels(info.models)
  }

  useEffect(() => {
    refresh()
    refreshMic()
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
          <div className="settings-label">macOS permissions</div>
          <p className="settings-hint">
            Recording needs two separate macOS permissions. If a meeting captures silence,
            check them here.
          </p>

          <div className="perm-row">
            <div className="perm-info">
              <span className="perm-name">Microphone</span>
              <span className="perm-sub">For in-person / room audio</span>
            </div>
            <PermBadge state={micStatus === 'granted' ? 'ok' : micStatus === 'denied' ? 'bad' : 'unknown'} />
            {micStatus === 'granted' ? (
              <button className="perm-btn" onClick={() => window.api.permissions.openPane('microphone')}>
                Settings
              </button>
            ) : (
              <button className="record-btn small" onClick={grantMic}>
                Grant
              </button>
            )}
          </div>

          <div className="perm-row">
            <div className="perm-info">
              <span className="perm-name">System Audio Recording</span>
              <span className="perm-sub">For Teams / meeting call audio</span>
            </div>
            <PermBadge
              state={sysAudio === 'working' ? 'ok' : sysAudio === 'failed' ? 'bad' : 'unknown'}
            />
            {sysAudio === 'failed' ? (
              <button className="record-btn small" onClick={() => window.api.permissions.openPane('audio')}>
                Open Settings
              </button>
            ) : (
              <button className="perm-btn" onClick={testSystemAudio} disabled={sysAudio === 'testing'}>
                {sysAudio === 'testing' ? 'Testing…' : sysAudio === 'working' ? 'Re-test' : 'Test'}
              </button>
            )}
          </div>
          {sysAudio === 'working' && (
            <p className="settings-hint" style={{ color: 'var(--ok)', marginTop: '6px' }}>
              System audio capture is working.
            </p>
          )}
        </div>

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
