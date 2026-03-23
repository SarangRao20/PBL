import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import Chat from './Chat.jsx'
import Documents from './Documents.jsx'
import KnowledgeBase from './KnowledgeBase.jsx'
import Analytics from './Analytics.jsx'

export default function Layout({ session, onLogout, addToast }) {
  const [activeTab, setActiveTab] = useState('chat')

  const renderPage = () => {
    switch (activeTab) {
      case 'chat':      return <Chat session={session} addToast={addToast} />
      case 'documents': return <Documents session={session} addToast={addToast} />
      case 'knowledge': return <KnowledgeBase session={session} addToast={addToast} />
      case 'analytics': return <Analytics session={session} addToast={addToast} />
      default:          return <Chat session={session} addToast={addToast} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        session={session}
        active={activeTab}
        onNav={setActiveTab}
        onLogout={onLogout}
      />
      <main className="main-content">
        <div className="grid-bg" />
        {renderPage()}
      </main>
    </div>
  )
}
