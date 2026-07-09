const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const defaultData = {
  users: [],
  messages: [],
  nextUserId: 1,
  nextMessageId: 1
};

let data = load();

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    }
  } catch {}
  return JSON.parse(JSON.stringify(defaultData));
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  data,
  save,
  findUserByUsername(username) {
    return data.users.find(u => u.username === username);
  },
  findUserById(id) {
    return data.users.find(u => u.id === id);
  },
  createUser(username, password, displayName) {
    const user = {
      id: data.nextUserId++,
      username,
      password,
      display_name: displayName,
      created_at: new Date().toISOString()
    };
    data.users.push(user);
    save();
    return user;
  },
  getUsers(excludeId) {
    return data.users
      .filter(u => u.id !== excludeId)
      .map(u => ({ id: u.id, username: u.username, display_name: u.display_name }));
  },
  getMessages(userId1, userId2) {
    return data.messages
      .filter(m =>
        (m.sender_id === userId1 && m.receiver_id === userId2) ||
        (m.sender_id === userId2 && m.receiver_id === userId1)
      )
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-100);
  },
  addMessage(senderId, receiverId, text, fileUrl, fileName, fileSize) {
    const message = {
      id: data.nextMessageId++,
      sender_id: senderId,
      receiver_id: receiverId,
      text: text || '',
      file_url: fileUrl || null,
      file_name: fileName || null,
      file_size: fileSize || null,
      created_at: new Date().toISOString()
    };
    data.messages.push(message);
    save();
    return message;
  }
};
