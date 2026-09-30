from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(default="USER", description="USER or AUTHORITY")
    phone: Optional[str] = Field(default=None, max_length=20)
    city: Optional[str] = None
    state: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    role: str
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    home_zone: Optional[str] = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserLocationUpdate(BaseModel):
    city: Optional[str] = None
    state: Optional[str] = None
    home_zone: Optional[str] = None
