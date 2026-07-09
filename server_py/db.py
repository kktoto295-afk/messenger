import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'messenger.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            text TEXT DEFAULT '',
            file_url TEXT DEFAULT NULL,
            file_name TEXT DEFAULT NULL,
            file_size INTEGER DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (receiver_id) REFERENCES users(id)
        );
    """)
    conn.commit()
    conn.close()


def find_user_by_username(username):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(user) if user else None


def find_user_by_id(user_id):
    conn = get_db()
    user = conn.execute("SELECT id, username, display_name FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None


def create_user(username, password, display_name):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)",
        (username, password, display_name)
    )
    conn.commit()
    user_id = cur.lastrowid
    conn.close()
    return {"id": user_id, "username": username, "display_name": display_name}


def get_users(exclude_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, username, display_name FROM users WHERE id != ?", (exclude_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_messages(user_id1, user_id2, limit=100):
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC LIMIT ?
    """, (user_id1, user_id2, user_id2, user_id1, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_message(sender_id, receiver_id, text, file_url=None, file_name=None, file_size=None):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO messages (sender_id, receiver_id, text, file_url, file_name, file_size) VALUES (?, ?, ?, ?, ?, ?)",
        (sender_id, receiver_id, text or '', file_url, file_name, file_size)
    )
    conn.commit()
    msg_id = cur.lastrowid
    row = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
    conn.close()
    return dict(row)
