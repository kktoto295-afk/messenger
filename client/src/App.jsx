import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const API = ''let socket = null

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [onlineUsers, setOnlineUsers] = useState([])
  const [typing, setTyping] = useState({})
  const [mobileView, setMobileView] = useState('list')
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(u => { setUser(u); loadUsers() })
      .catch(() => { setToken(null); localStorage.removeItem('token') })
  }, [token])

  useEffect(() => {
    if (!user) return
    socket = io({ auth: { token } })
    socket.on('online-users', setOnlineUsers)
    socket.on('new-message', (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        if (msg.sender_id === selectedUser?.id || msg.receiver_id === selectedUser?.id) {
          return [...prev, msg]
        }
        return prev
      })
    })
    socket.on('typing', ({ user_id }) => setTyping(prev => ({ ...prev, [user_id]: true })))
    socket.on('stop-typing', ({ user_id }) => setTyping(prev => ({ ...prev, [user_id]: false })))
    return () => { socket?.disconnect() }
  }, [user, selectedUser?.id])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadUsers = async () => {
    const r = await fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
    setUsers(await r.json())
  }

  const loadMessages = async (userId) => {
    const r = await fetch(`${API}/api/messages/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
    setMessages(await r.json())
  }

  const selectUser = (u) => {
    setSelectedUser(u)
    loadMessages(u.id)
    setMobileView('chat')
    setTyping({})
  }

  const sendMessage = async () => {
    if (!text.trim() && !fileInputRef.current?.files?.length) return
    let fileData = {}
    if (fileInputRef.current?.files?.length) {
      const formData = new FormData()
      formData.append('file', fileInputRef.current.files[0])
      const r = await fetch(`${API}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      fileData = await r.json()
      fileInputRef.current.value = ''
    }
    socket.emit('send-message', {
      receiver_id: selectedUser.id,
      text: text.trim(),
      ...fileData
    })
    setText('')
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    socket.emit('stop-typing', { receiver_id: selectedUser.id })
  }

  const handleTyping = (e) => {
    setText(e.target.value)
    if (!typingTimeoutRef.current) {
      socket.emit('typing', { receiver_id: selectedUser.id })
    }
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop-typing', { receiver_id: selectedUser.id })
      typingTimeoutRef.current = null
    }, 1000)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!token) return <AuthPage onAuth={(t, u) => { setToken(t); localStorage.setItem('token', t); setUser(u) }} />

  if (!user) return null

  const viewClass = mobileView === 'list' ? 'mobile-list' : 'mobile-chat'

  return (
    <div className={`app-layout ${viewClass}`}>
      <div className="chat-list">
        <div className="chat-list-header">
          <span>Messenger</span>
          <button onClick={() => { setToken(null); localStorage.removeItem('token'); socket?.disconnect() }}>
            Logout
          </button>
        </div>
        <div className="chat-items">
          {users.map(u => (
            <div
              key={u.id}
              className={`chat-item ${selectedUser?.id === u.id ? 'active' : ''}`}
              onClick={() => selectUser(u)}
            >
              <div className="chat-item-avatar">{u.display_name?.[0]?.toUpperCase() || '?'}</div>
              <div className="chat-item-info">
                <div className="chat-item-name">{u.display_name}</div>
                <div className={`chat-item-status ${onlineUsers.includes(u.id) ? 'online' : ''}`}>
                  {onlineUsers.includes(u.id) ? 'Online' : 'Offline'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="chat-area">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <button className="mobile-back" onClick={() => setMobileView('list')}>&larr;</button>
              {selectedUser.display_name}
            </div>
            {typing[selectedUser.id] && <div className="typing-indicator">typing...</div>}
            <div className="messages">
              {messages.map(m => (
                <div key={m.id} className={`message ${m.sender_id === user.id ? 'own' : 'other'}`}>
                  {m.text && <div>{m.text}</div>}
                  {m.file_url && (
                    <div className="message-file">
                      <a href={`${API}${m.file_url}`} target="_blank" rel="noopener noreferrer">
                        {m.file_name || 'File'}
                      </a>
                    </div>
                  )}
                  <div className="message-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="file-preview" id="filePreview"></div>
            <div className="message-input-area">
              <button className="attach-btn" onClick={() => fileInputRef.current?.click()}>&#128206;</button>
              <input
                type="text"
                placeholder="Type a message..."
                value={text}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
              />
              <button onClick={sendMessage}>Send</button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }}
                onChange={(e) => {
                  const preview = document.getElementById('filePreview')
                  if (preview) preview.textContent = e.target.files[0]?.name || ''
                }}
              />
            </div>
          </>
        ) : (
          <div className="no-chat">Select a chat to start messaging</div>
        )}
      </div>
    </div>
  )
}

function AuthPage({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const endpoint = isLogin ? '/api/login' : '/api/register'
    const body = isLogin ? { username, password } : { username, password, display_name: displayName }
    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await r.json()
      if (!r.ok) return setError(data.error)
      onAuth(data.token, data.user)
    } catch { setError('Connection error') }
  }

  return (
    <div className="auth-page">
      <h1>Messenger</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
        {!isLogin && (
          <input placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
        )}
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <div className="error">{error}</div>}
        <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
      </form>
      <div className="auth-link">
        {isLogin ? "Don't have an account? " : 'Already have an account? '}
        <span onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Register' : 'Login'}</span>
      </div>
    </div>
  )
}

export default App
