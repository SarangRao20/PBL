import { useState } from 'react'
import { Brain, GraduationCap, BookOpen, AlertTriangle, Loader } from 'lucide-react'

export default function Login({ onLogin, addToast }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [exiting, setExiting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) { setError('Please fill in all fields.'); return }
    setLoading(true); setError('')

    try {
      const fd = new FormData()
      fd.append('username', username)
      fd.append('password', password)
      fd.append('role', role)

      await fetch('/login', { method: 'POST', body: fd, credentials: 'include', redirect: 'manual' })

      const r = await fetch('/api/current_session', { credentials: 'include' })
      if (r.ok) {
        const data = await r.json()
        if (data?.session_id) {
          setExiting(true)
          setTimeout(() => onLogin(data), 480)
          return
        }
      }
      throw new Error('auth_failed')
    } catch {
      setError('Invalid credentials. Use professor/admin or student/student.')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(e) }

  return (
    <div className={`login-page ${exiting ? 'exit' : ''}`}>
      <div className="login-glow" />
      <div className="login-card">
        <div className="login-brand">
          <div className="login-icon-wrap"><Brain size={28} /></div>
          <div className="login-title">QModule</div>
          <div className="login-subtitle">Academic Intelligence Platform</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="field-label">Username</label>
            <input
              className="field-input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKey}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label className="field-label">Password</label>
            <input
              className="field-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="field-label">Access Level</label>
            <div className="role-grid">
              <div
                className={`role-option ${role === 'student' ? 'selected' : ''}`}
                onClick={() => setRole('student')}
              >
                <GraduationCap size={22} />
                <span className="role-option-name">Student</span>
                <span className="role-option-desc">Query & learn</span>
              </div>
              <div
                className={`role-option ${role === 'professor' ? 'selected' : ''}`}
                onClick={() => setRole('professor')}
              >
                <BookOpen size={22} />
                <span className="role-option-name">Professor</span>
                <span className="role-option-desc">Full access</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Loader size={16} className="spin" /> Authenticating...
                </span>
              : 'Sign In to QModule'
            }
          </button>
        </form>

        <div className="login-hint">
          <span style={{ color: 'var(--t2)' }}>Demo credentials</span><br />
          professor / admin &nbsp;·&nbsp; student / student
        </div>
      </div>
    </div>
  )
}
