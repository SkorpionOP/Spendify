# API Routing Audit Report

## 1. FRONTEND API CONFIGURATION

### Base URL
- **File**: [frontend/src/services/api.js](frontend/src/services/api.js#L5)
- **BaseURL**: `/api`
- **Credentials**: `withCredentials: true`

### Development Proxy (Vite)
- **File**: [frontend/vite.config.js](frontend/vite.config.js#L72-L76)
- **Rule**: `/api` → `http://127.0.0.1:8000`
- **Status**: ✅ Correct

### API Endpoints Called
All use the `api` client with baseURL `/api`:
| Endpoint | File | Type |
|----------|------|------|
| `/auth/signup` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L90) | POST |
| `/auth/login` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L77) | POST |
| `/auth/logout` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L104) | POST |
| `/auth/me` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L14) | GET |
| `/auth/firebase` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L113) | POST |
| `/dashboard` | [Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L55) | GET |
| `/expenses/*` | Multiple pages | GET/POST |
| `/budget/*` | [Setup.jsx](frontend/src/pages/Setup.jsx#L53) | POST |
| `/analysis` | [Analysis.jsx](frontend/src/pages/Analysis.jsx#L39) | GET |

**Frontend sends**: `/api/auth/signup`, `/api/auth/me`, etc.

---

## 2. BACKEND FASTAPI ROUTING

### Router Prefixes
All defined in [backend/main.py](backend/main.py#L47-L51):

| Router | Module | Prefix | Final Routes |
|--------|--------|--------|--------------|
| auth | [backend/routers/auth.py](backend/routers/auth.py#L6) | `/auth` | `/api/auth/*` |
| dashboard | [backend/routers/dashboard.py](backend/routers/dashboard.py#L8) | `/dashboard` | `/api/dashboard/*` |
| expenses | [backend/routers/expenses.py](backend/routers/expenses.py#L8) | `/expenses` | `/api/expenses/*` |
| budget | [backend/routers/budget.py](backend/routers/budget.py#L7) | `/budget` | `/api/budget/*` |
| analysis | [backend/routers/analysis.py](backend/routers/analysis.py#L6) | `/analysis` | `/api/analysis/*` |

### FastAPI App Registration
```python
app.include_router(auth.router, prefix="/api")        # /api/auth/*
app.include_router(dashboard.router, prefix="/api")   # /api/dashboard/*
...
```

**Backend expects**: `/api/auth/me`, `/api/dashboard`, etc.

---

## 3. VERCEL DEPLOYMENT CONFIGURATION

### Current Setup
- **File**: [vercel.json](vercel.json#L1-L10)

```json
{
  "builds": [
    {"src": "frontend/package.json", "use": "@vercel/static-build", "config": {"distDir": "dist"}},
    {"src": "backend/main.py", "use": "@vercel/python"}
  ],
  "rewrites": [
    {"source": "/api/(.*)", "destination": "/backend/main.py"}
  ]
}
```

### How Vercel Rewrite Works
1. Request: `GET /api/auth/me`
2. Matches: `/api/(.*)`
3. Rewrites to: `/backend/main.py` (serverless function)
4. **Problem**: Path handling unclear

---

## 4. DIAGNOSED ISSUE

### Current Error Flow
```
Frontend:  GET /api/auth/me
   ↓
Browser:   /_/backend/api/auth/me (Vercel shows this path)
   ↓
Vercel:    Rewrite rule matches /api/(.*)
   ↓
Python:    /backend/main.py invoked
   ↓
FastAPI:   Receives request, but path format unclear
   ↓
Result:    404 NOT FOUND
```

### Root Cause
The Vercel rewrite rule needs clarification on **path handling**:
- Is the path `/api/auth/me` preserved and passed to the function?
- Or is it stripped to just `/auth/me`?

---

## 5. ROUTE MAP (Expected Behavior)

### Development (Vite Proxy - Works ✅)
```
Frontend: api.get('/auth/me')
  → Full URL: /api/auth/me
  → Vite proxy: /api → http://127.0.0.1:8000
  → Backend receives: GET http://127.0.0.1:8000/api/auth/me
  → FastAPI route: /api/auth → matches ✅
```

### Production (Vercel - Issue ❌)
```
Frontend: api.get('/auth/me')
  → Full URL: /api/auth/me
  → Vercel rewrite: /api/(.*) → /backend/main.py
  → Backend receives: GET /_/backend/api/auth/me ???
  → FastAPI route: /api/auth → unknown ❌
```

---

## 6. VERIFICATION CHECKLIST

### ✅ What Works
- Frontend correctly targets `/api/*`
- Vite dev proxy is correctly configured
- Backend routers are correctly prefixed with `/api`
- Backend routes are correctly defined

### ❌ What Fails
- Vercel rewrite rule doesn't explicitly handle path preservation
- Unclear if Vercel strips `/api` prefix before passing to function
- No explicit path routing in FastAPI for Vercel context

---

## 7. RECOMMENDED FIXES

### Option A: Fix Vercel Rewrite (Recommended)
Update [vercel.json](vercel.json) to ensure path is correctly passed:

**Current:**
```json
{"source": "/api/(.*)", "destination": "/backend/main.py"}
```

**Should be:**
```json
{"source": "/api/(.*)", "destination": "/api/$1"}
```
OR pass context to the handler.

### Option B: Make Backend Path-Agnostic
Remove `/api` prefix requirement from FastAPI and route based on path segments.

### Option C: Add Vercel Environment Variable
Route based on whether running on Vercel vs local.

