"""
Password hashing + JWT helpers. No plain-text passwords are ever stored.

NOTE: password hashing uses the `bcrypt` package directly rather than
passlib's CryptContext. passlib 1.7.x's bcrypt backend probes
`bcrypt.__about__.__version__`, which was removed in bcrypt>=4.1 and makes
every hash()/verify() call raise, breaking register/login with a 500 while
looking "successful" on the frontend (it just silently falls back to
offline demo mode). Calling bcrypt directly avoids that failure mode
entirely, regardless of bcrypt's installed version.
"""
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from config import settings
from database.connection import get_db
from database import models

bearer_scheme = HTTPBearer(auto_error=False)

# bcrypt has a hard 72-byte input limit; longer passwords are truncated
# safely (rather than raising) so a long passphrase never 500s the request.
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    pw_bytes = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        pw_bytes = plain_password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
        return bcrypt.checkpw(pw_bytes, password_hash.encode("utf-8"))
    except ValueError:
        # malformed/legacy hash in the DB — treat as "does not match" rather
        # than crashing the login endpoint
        return False


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(
        minutes=expires_minutes or settings.JWT_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_authority(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != models.UserRole.AUTHORITY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authority role required for this action",
        )
    return user
