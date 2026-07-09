import jwt
from datetime import datetime, timedelta

JWT_SECRET = 'messenger-secret-key-change-in-production'


def auth_middleware(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    try:
        token = auth_header.split(' ')[1]
        decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return decoded
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, IndexError):
        return None


def generate_token(user):
    payload = {
        'id': user['id'],
        'username': user['username'],
        'exp': datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')
