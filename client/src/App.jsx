import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const API = ''
let socket = null

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
  const [page, setPage] = useState('landing')
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
    setSelectedUser(u); loadMessages(u.id); setMobileView('chat'); setTyping({})
  }

  const sendMessage = async () => {
    if (!text.trim() && !fileInputRef.current?.files?.length) return
    let fileData = {}
    if (fileInputRef.current?.files?.length) {
      const formData = new FormData()
      formData.append('file', fileInputRef.current.files[0])
      const r = await fetch(`${API}/api/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
      })
      fileData = await r.json()
      fileInputRef.current.value = ''
    }
    socket.emit('send-message', { receiver_id: selectedUser.id, text: text.trim(), ...fileData })
    setText('')
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    socket.emit('stop-typing', { receiver_id: selectedUser.id })
  }

  const handleTyping = (e) => {
    setText(e.target.value)
    if (!typingTimeoutRef.current) socket.emit('typing', { receiver_id: selectedUser.id })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop-typing', { receiver_id: selectedUser.id })
      typingTimeoutRef.current = null
    }, 1000)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function afterAuth(t, u) { setToken(t); localStorage.setItem('token', t); setUser(u) }

  if (!token && page === 'landing') return <LandingPage onGetStarted={() => setPage('auth')} />
  if (!token) return <AuthPage onAuth={afterAuth} onBack={() => setPage('landing')} />
  if (!user) return null

  const viewClass = mobileView === 'list' ? 'mobile-list' : 'mobile-chat'

  return (
    <div className={`app-layout ${viewClass}`}>
      <div className="chat-list">
        <div className="chat-list-header">
          <div className="chat-list-logo">
            <span className="chat-list-icon">G</span>
            <span>ГусьГусь</span>
          </div>
          <button className="logout-btn" onClick={() => { setToken(null); localStorage.removeItem('token'); socket?.disconnect() }}>
            Выйти
          </button>
        </div>
        <div className="chat-items">
          {users.map(u => (
            <div key={u.id} className={`chat-item ${selectedUser?.id === u.id ? 'active' : ''}`} onClick={() => selectUser(u)}>
              <div className="chat-item-avatar">{u.display_name?.[0]?.toUpperCase() || '?'}</div>
              <div className="chat-item-info">
                <div className="chat-item-name">{u.display_name}</div>
                <div className={`chat-item-status ${onlineUsers.includes(u.id) ? 'online' : ''}`}>
                  {onlineUsers.includes(u.id) ? 'В сети' : 'Не в сети'}
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
              <div className="chat-header-avatar">{selectedUser.display_name[0].toUpperCase()}</div>
              <div>
                <div className="chat-header-name">{selectedUser.display_name}</div>
                <div className={`chat-header-status ${onlineUsers.includes(selectedUser.id) ? 'online' : ''}`}>
                  {onlineUsers.includes(selectedUser.id) ? 'В сети' : 'Не в сети'}
                </div>
              </div>
            </div>
            {typing[selectedUser.id] && <div className="typing-indicator">печатает...</div>}
            <div className="messages">
              {messages.map(m => (
                <div key={m.id} className={`message ${m.sender_id === user.id ? 'own' : 'other'}`}>
                  {m.text && <div>{m.text}</div>}
                  {m.file_url && (
                    <div className="message-file">
                      <a href={`${API}${m.file_url}`} target="_blank" rel="noopener noreferrer">{m.file_name || 'File'}</a>
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
              <input type="text" placeholder={`Написать @${selectedUser.display_name}`} value={text} onChange={handleTyping} onKeyDown={handleKeyDown} />
              <button onClick={sendMessage}>Отправить</button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }}
                onChange={(e) => { const p = document.getElementById('filePreview'); if (p) p.textContent = e.target.files[0]?.name || '' }}
              />
            </div>
          </>
        ) : (
          <div className="no-chat">Выберите чат для начала общения</div>
        )}
      </div>
    </div>
  )
}

function LandingPage({ onGetStarted }) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <span className="landing-logo-icon">G</span>
            <span>ГусьГусь</span>
          </div>
          <button className="landing-cta-btn" onClick={onGetStarted}>Вход / Регистрация</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-bg"></div>
        <div className="hero-content">
          <h1>Общайтесь с друзьями<br />в <span className="highlight">ГусьГусь</span></h1>
          <p>Бесплатный мессенджер с шифрованием, файлами и историей сообщений. Просто, быстро и безопасно.</p>
          <button className="hero-btn" onClick={onGetStarted}>Начать общение</button>
        </div>
      </section>

      <section className="features">
        <h2 className="features-title">Всё что нужно для общения</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">&#128172;</div>
            <h3>Мгновенные сообщения</h3>
            <p>Сообщения доставляются в реальном времени через WebSocket. Вы никогда не пропустите важное.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128274;</div>
            <h3>Приватность и безопасность</h3>
            <p>Ваши данные защищены. Пароли шифруются, а история хранится только у вас на сервере.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128206;</div>
            <h3>Отправка файлов</h3>
            <p>Делитесь фотографиями, документами и любыми файлами до 50 МБ прямо в чате.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128221;</div>
            <h3>История сообщений</h3>
            <p>Все сообщения сохраняются. Вы можете вернуться к любому диалогу в любой момент.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128242;</div>
            <h3>Работает везде</h3>
            <p>Доступно с любого устройства: компьютер, телефон, планшет — нужен только браузер.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128640;</div>
            <h3>Совершенно бесплатно</h3>
            <p>Никаких подписок и скрытых платежей. Всё полностью бесплатно для вас и ваших друзей.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-logo">ГусьГусь</div>
          <p>© 2026 ГусьГусь. Все права защищены. Сделано с ❤️ для друзей.</p>
        </div>
      </footer>
    </div>
  )
}

function AuthPage({ onAuth, onBack }) {
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      const data = await r.json()
      if (!r.ok) return setError(data.error)
      onAuth(data.token, data.user)
    } catch { setError('Ошибка соединения') }
  }

  return (
    <div className="auth-page">
      <div className="auth-page-bg"></div>
      <nav className="auth-nav">
        <div className="auth-nav-inner">
          <div className="landing-logo" onClick={onBack} style={{ cursor: 'pointer' }}>
            <span className="landing-logo-icon">G</span>
            <span>ГусьГусь</span>
          </div>
        </div>
      </nav>
      <div className="auth-card-wrap">
        <div className="auth-card-header">
          <h1 className="auth-title">{isLogin ? 'С возвращением!' : 'Создать аккаунт'}</h1>
          <p className="auth-subtitle">{isLogin ? 'Войдите чтобы продолжить' : 'Присоединяйтесь к ГусьГусь'}</p>
        </div>
        <div className="auth-container">
          <div className={`slider-track ${!isLogin ? 'slider-right' : ''}`}></div>
          <div className="slider-btn">
            <button className="login" onClick={() => setIsLogin(true)}>Войти</button>
            <button className="signup" onClick={() => setIsLogin(false)}>Регистрация</button>
          </div>
          <div className={`form-section ${!isLogin ? 'form-move' : ''}`}>
            <form className="login-box" onSubmit={handleSubmit}>
              <input type="text" className="email ele" placeholder="Имя пользователя" value={username} onChange={e => setUsername(e.target.value)} required />
              <input type="password" className="password ele" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required />
              {error && <div className="error">{error}</div>}
              <button className="clkbtn">Войти</button>
            </form>
            <form className="signup-box" onSubmit={handleSubmit}>
              <input type="text" className="name ele" placeholder="Отображаемое имя" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
              <input type="text" className="email ele" placeholder="Имя пользователя" value={username} onChange={e => setUsername(e.target.value)} required />
              <input type="password" className="password ele" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required />
              {error && <div className="error">{error}</div>}
              <button className="clkbtn">Регистрация</button>
            </form>
          </div>
        </div>
      </div>
      <footer className="auth-footer">
        <p>© 2026 ГусьГусь. Все права защищены.</p>
      </footer>
    </div>
  )
}

export default App
