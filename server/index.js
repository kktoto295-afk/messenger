const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { authMiddleware, generateToken } = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/register', (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const existing = db.findUserByUsername(username);
  if (existing) return res.status(400).json({ error: 'Username already exists' });

  const hashed = bcrypt.hashSync(password, 10);
  const user = db.createUser(username, hashed, display_name);
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'All fields required' });

  const user = db.findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
});

app.get('/api/users', authMiddleware, (req, res) => {
  res.json(db.getUsers(req.userId));
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.findUserById(req.userId);
  res.json({ id: user.id, username: user.username, display_name: user.display_name });
});

app.get('/api/messages/:userId', authMiddleware, (req, res) => {
  const messages = db.getMessages(req.userId, parseInt(req.params.userId));
  res.json(messages);
});

app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    file_url: `/uploads/${req.file.filename}`,
    file_name: req.file.originalname,
    file_size: req.file.size
  });
});

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('./auth');
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  onlineUsers.set(socket.userId, socket.id);
  io.emit('online-users', Array.from(onlineUsers.keys()));

  socket.on('send-message', (data) => {
    const message = db.addMessage(
      socket.userId,
      data.receiver_id,
      data.text,
      data.file_url,
      data.file_name,
      data.file_size
    );

    const receiverSocketId = onlineUsers.get(data.receiver_id);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('new-message', message);
    }
    socket.emit('new-message', message);
  });

  socket.on('typing', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiver_id);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing', { user_id: socket.userId });
    }
  });

  socket.on('stop-typing', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiver_id);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('stop-typing', { user_id: socket.userId });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.userId);
    io.emit('online-users', Array.from(onlineUsers.keys()));
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
