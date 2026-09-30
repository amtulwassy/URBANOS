from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.connection import get_db
from database import models
from schemas.user import UserRegister, UserLogin, TokenResponse, UserOut, UserLocationUpdate
from utils.security import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED,
    summary="Register a new USER or AUTHORITY account",
)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    role = payload.role.upper()
    if role not in (models.UserRole.USER.value, models.UserRole.AUTHORITY.value):
        raise HTTPException(status_code=400, detail="role must be USER or AUTHORITY")

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

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

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse, summary="Log in and receive a JWT")
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut, summary="Get the currently authenticated user")
def me(current_user: models.User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me/location", response_model=UserOut, summary="Update the user's selected city/state/zone")
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
