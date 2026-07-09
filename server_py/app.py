import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from db import init_db, find_user_by_username, find_user_by_id, create_user, get_users, get_messages, add_message
from auth import auth_middleware, generate_token, JWT_SECRET

app = Flask(__name__, static_folder='../client/dist', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
CORS(app)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

init_db()

heartbeats = {}

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    display_name = data.get('display_name')

    if not username or not password or not display_name:
        return jsonify({'error': 'All fields required'}), 400

    if find_user_by_username(username):
        return jsonify({'error': 'Username already exists'}), 400

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = create_user(username, hashed, display_name)
    token = generate_token(user)
    return jsonify({'token': token, 'user': user})


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'All fields required'}), 400

    user = find_user_by_username(username)
    if not user or not bcrypt.checkpw(password.encode(), user['password'].encode()):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = generate_token(user)
    return jsonify({'token': token, 'user': {'id': user['id'], 'username': user['username'], 'display_name': user['display_name']}})


@app.route('/api/me')
def me():
    payload = auth_middleware(request)
    if not payload:
        return jsonify({'error': 'Unauthorized'}), 401
    user = find_user_by_id(payload['id'])
    return jsonify(user)


@app.route('/api/users')
def list_users():
    payload = auth_middleware(request)
    if not payload:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(get_users(payload['id']))


@app.route('/api/messages/<int:user_id>')
def messages(user_id):
    payload = auth_middleware(request)
    if not payload:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(get_messages(payload['id'], user_id))


@app.route('/api/messages', methods=['POST'])
def send_message():
    payload = auth_middleware(request)
    if not payload:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    message = add_message(
        payload['id'],
        data.get('receiver_id'),
        data.get('text', ''),
        data.get('file_url'),
        data.get('file_name'),
        data.get('file_size')
    )
    return jsonify(message)


@app.route('/api/heartbeat', methods=['POST'])
def heartbeat():
    payload = auth_middleware(request)
    if not payload:
        return jsonify({'error': 'Unauthorized'}), 401
    heartbeats[payload['id']] = datetime.utcnow()
    cutoff = datetime.utcnow() - timedelta(seconds=60)
    for uid in list(heartbeats.keys()):
        if heartbeats[uid] < cutoff:
            del heartbeats[uid]
    return jsonify({'ok': True})


@app.route('/api/online')
def online():
    payload = auth_middleware(request)
    if not payload:
        return jsonify({'error': 'Unauthorized'}), 401
    cutoff = datetime.utcnow() - timedelta(seconds=60)
    online_ids = [uid for uid, ts in heartbeats.items() if ts > cutoff]
    return jsonify(online_ids)


@app.route('/api/upload', methods=['POST'])
def upload():
    payload = auth_middleware(request)
    if not payload:
        return jsonify({'error': 'Unauthorized'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = os.path.splitext(file.filename)[1]
    filename = str(uuid.uuid4()) + ext
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    return jsonify({
        'file_url': f'/uploads/{filename}',
        'file_name': file.filename,
        'file_size': os.path.getsize(filepath)
    })


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
