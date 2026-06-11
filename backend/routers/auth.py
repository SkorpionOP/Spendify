from fastapi import APIRouter, Depends, HTTPException, Response, Request
from itsdangerous import Signer, BadSignature
from backend.models.db_wrapper import get_db, PostgresWrapper
from backend.schemas.auth import SignupRequest, LoginRequest, FirebaseLinkRequest, AuthResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

SIGNER_SECRET = "secret123"

def sign_user_id(user_id: int) -> str:
    s = Signer(SIGNER_SECRET)
    return s.sign(str(user_id).encode()).decode()

def unsign_user_id(signed_value: str) -> int:
    s = Signer(SIGNER_SECRET)
    try:
        unsigned = s.unsign(signed_value.encode()).decode()
        return int(unsigned)
    except BadSignature:
        return None

def get_current_user_id(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = unsign_user_id(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid session token")
    return user_id

@router.post("/signup", response_model=AuthResponse)
def signup(payload: SignupRequest, response: Response, db: PostgresWrapper = Depends(get_db)):
    try:
        db.execute(
            "INSERT INTO users (email, password) VALUES (?, ?)",
            (payload.email, payload.password)
        )
        db.commit()
    except Exception:
        raise HTTPException(status_code=400, detail="Email already registered.")
    
    user = db.execute("SELECT * FROM users WHERE email=?", (payload.email,)).fetchone()
    token = sign_user_id(user["id"])
    response.set_cookie(key="session_token", value=token, httponly=True, samesite="lax")
    return AuthResponse(
        status="success",
        user_id=user["id"],
        name=user.get("name"),
        profile_pic=user.get("profile_pic")
    )

@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response, db: PostgresWrapper = Depends(get_db)):
    user = db.execute(
        "SELECT * FROM users WHERE email=? AND password=?",
        (payload.email, payload.password)
    ).fetchone()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or password.")
        
    token = sign_user_id(user["id"])
    response.set_cookie(key="session_token", value=token, httponly=True, samesite="lax")
    return AuthResponse(
        status="success",
        user_id=user["id"],
        name=user.get("name"),
        profile_pic=user.get("profile_pic")
    )

@router.post("/firebase", response_model=AuthResponse)
def auth_firebase(payload: FirebaseLinkRequest, response: Response, db: PostgresWrapper = Depends(get_db)):
    uid = payload.uid
    email = payload.email
    name = payload.name
    profile_pic = payload.profile_pic

    if not uid:
        raise HTTPException(status_code=400, detail="Missing credentials")

    user = db.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()

    if not user:
        if email:
            user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if user:
                db.execute(
                    "UPDATE users SET uid=?, name=?, profile_pic=? WHERE email=?",
                    (uid, name, profile_pic, email)
                )
            else:
                db.execute(
                    "INSERT INTO users (email, uid, name, profile_pic) VALUES (?, ?, ?, ?)",
                    (email, uid, name, profile_pic)
                )
        else:
            db.execute(
                "INSERT INTO users (uid, name, profile_pic) VALUES (?, ?, ?)",
                (uid, name, profile_pic)
            )
        db.commit()
        user = db.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()

    token = sign_user_id(user["id"])
    response.set_cookie(key="session_token", value=token, httponly=True, samesite="lax")
    return AuthResponse(
        status="success",
        user_id=user["id"],
        name=user.get("name") or name,
        profile_pic=user.get("profile_pic") or profile_pic
    )

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("session_token")
    return {"status": "success"}

@router.get("/me", response_model=AuthResponse)
def get_me(request: Request, db: PostgresWrapper = Depends(get_db)):
    user_id = get_current_user_id(request)
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return AuthResponse(
        status="success",
        user_id=user["id"],
        name=user.get("name"),
        profile_pic=user.get("profile_pic")
    )

@router.get("/firebase-config")
def get_firebase_config():
    import os
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY"),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID"),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": os.getenv("FIREBASE_APP_ID"),
        "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID")
    }

