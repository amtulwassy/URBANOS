from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database.connection import get_db
from database import models

from schemas.user import (
    UserRegister,
    UserLogin,
    TokenResponse,
    UserOut,
    UserLocationUpdate,
)

from utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

from google.oauth2 import id_token
from google.auth.transport import requests

import secrets


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


# ============================================================
# GOOGLE CONFIGURATION
# ============================================================

GOOGLE_CLIENT_ID = (
    "1053975221953-qp4tusgsldgp1da7pdltufvmff2u6v4j.apps.googleusercontent.com"
)


# ============================================================
# GOOGLE LOGIN REQUEST
# ============================================================

class GoogleLoginRequest(BaseModel):
    credential: str
    role: str = "USER"


# ============================================================
# REGISTER
# ============================================================

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new USER or AUTHORITY account",
)
def register(
    payload: UserRegister,
    db: Session = Depends(get_db)
):

    role = payload.role.upper()

    if role not in (
        models.UserRole.USER.value,
        models.UserRole.AUTHORITY.value
    ):
        raise HTTPException(
            status_code=400,
            detail="role must be USER or AUTHORITY"
        )

    existing = (
        db.query(models.User)
        .filter(models.User.email == payload.email)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists"
        )

    user = models.User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=role,
        phone=payload.phone,
        city=payload.city,
        state=payload.state,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({
        "sub": user.id,
        "role": user.role.value
    })

    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user)
    )


# ============================================================
# NORMAL LOGIN
# ============================================================

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in and receive a JWT"
)
def login(
    payload: UserLogin,
    db: Session = Depends(get_db)
):

    user = (
        db.query(models.User)
        .filter(models.User.email == payload.email)
        .first()
    )

    if not user or not verify_password(
        payload.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    token = create_access_token({
        "sub": user.id,
        "role": user.role.value
    })

    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user)
    )


# ============================================================
# GOOGLE LOGIN
# ============================================================

@router.post(
    "/google",
    response_model=TokenResponse,
    summary="Login or register using Google"
)
def google_login(
    payload: GoogleLoginRequest,
    db: Session = Depends(get_db)
):

    # --------------------------------------------------------
    # Validate requested role
    # --------------------------------------------------------

    role = payload.role.upper()

    if role not in (
        models.UserRole.USER.value,
        models.UserRole.AUTHORITY.value
    ):
        raise HTTPException(
            status_code=400,
            detail="role must be USER or AUTHORITY"
        )


    # --------------------------------------------------------
    # Verify Google credential
    # --------------------------------------------------------

    try:

        google_user = id_token.verify_oauth2_token(
            payload.credential,
            requests.Request(),
            GOOGLE_CLIENT_ID
        )

    except ValueError:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential"
        )


    # --------------------------------------------------------
    # Check Google account information
    # --------------------------------------------------------

    email = google_user.get("email")
    name = google_user.get("name") or "Google User"
    email_verified = google_user.get("email_verified", False)

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account email was not provided"
        )

    if not email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email is not verified"
        )


    # --------------------------------------------------------
    # Find existing URBANOS account
    # --------------------------------------------------------

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )


    # --------------------------------------------------------
    # Create account if it doesn't exist
    # --------------------------------------------------------

    if not user:

        # Google users don't use the normal password.
        # Generate a random unusable password hash.
        random_password = secrets.token_urlsafe(32)

        user = models.User(
            name=name,
            email=email,
            password_hash=hash_password(random_password),
            role=role,
        )

        db.add(user)
        db.commit()
        db.refresh(user)


    # --------------------------------------------------------
    # Existing user
    # --------------------------------------------------------

    token = create_access_token({
        "sub": user.id,
        "role": user.role.value
    })


    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user)
    )


# ============================================================
# CURRENT USER
# ============================================================

@router.get(
    "/me",
    response_model=UserOut,
    summary="Get the currently authenticated user"
)
def me(
    current_user: models.User = Depends(get_current_user)
):

    return UserOut.model_validate(current_user)


# ============================================================
# UPDATE LOCATION
# ============================================================

@router.patch(
    "/me/location",
    response_model=UserOut,
    summary="Update the user's selected city/state/zone"
)
def update_location(
    payload: UserLocationUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    if payload.city is not None:
        current_user.city = payload.city

    if payload.state is not None:
        current_user.state = payload.state

    if payload.home_zone is not None:
        current_user.home_zone = payload.home_zone

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return UserOut.model_validate(current_user)