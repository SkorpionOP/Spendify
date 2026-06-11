from pydantic import BaseModel, EmailStr
from typing import Optional

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class FirebaseLinkRequest(BaseModel):
    uid: str
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    profile_pic: Optional[str] = None

class AuthResponse(BaseModel):
    status: str
    message: Optional[str] = None
    user_id: Optional[int] = None
    name: Optional[str] = None
    profile_pic: Optional[str] = None
