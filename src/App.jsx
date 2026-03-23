import { useState, useEffect, useCallback } from 'react'
import { Loader } from 'lucide-react'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import Toast from './components/Toast.jsx'

export default function App() {
  const [session, setSession] = useState(null) // null=loading, false=logged out, obj=logged in
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3600)
  }, [])

  useEffect(() => {
    fetch('/api/current_session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.session_id) setSession(data)
        else setSession(false)
      })
      .catch(() => setSession(false))
  }, [])

  const handleLogin = useCallback((data) => {
    setSession(data)
    addToast(`Welcome back, ${data.author}!`, 'success')
  }, [addToast])

  const handleLogout = useCallback(async () => {
    try { await fetch('/logout', { credentials: 'include', redirect: 'manual' }) } catch {}
    setSession(false)
    addToast('Signed out successfully', 'info')
  }, [])

  if (session === null) {
    return (
      <div className="loading-screen">
        <Loader size={36} className="spin" color="var(--violet)" />
        <span className="loading-label">Initializing</span>
      </div>
    )
  }

  return (
    <>
      {/* Background orbs always present */}
      <div className="orb-layer">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {session === false
        ? <Login onLogin={handleLogin} addToast={addToast} />
        : <Layout session={session} onLogout={handleLogout} addToast={addToast} />
      }

      <Toast toasts={toasts} />
    </>
  )
}
