# Complete Route Map - After Fixes

## Frontend API Requests

### Base Configuration
- **Base URL**: `/api` ([frontend/src/services/api.js](frontend/src/services/api.js#L5))
- **Credentials**: Include cookies (withCredentials: true)

---

## All Frontend API Endpoints

### Authentication Routes (`/api/auth/*`)
| Method | Endpoint | Frontend Call | Backend Handler |
|--------|----------|---------------|-----------------|
| POST | `/api/auth/signup` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L90) | [auth.py](backend/routers/auth.py#L34) - signup() |
| POST | `/api/auth/login` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L77) | [auth.py](backend/routers/auth.py#L50) - login() |
| POST | `/api/auth/logout` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L104) | [auth.py](backend/routers/auth.py#L114) - logout() |
| GET | `/api/auth/me` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L14) | [auth.py](backend/routers/auth.py#L119) - get_me() |
| POST | `/api/auth/firebase` | [useAuth.jsx](frontend/src/hooks/useAuth.jsx#L113) | [auth.py](backend/routers/auth.py#L84) - auth_firebase() |
| GET | `/api/auth/firebase-config` | [firebase.js](frontend/src/services/firebase.js) | [auth.py](backend/routers/auth.py#L134) - get_firebase_config() |

### Dashboard Routes (`/api/dashboard/*`)
| Method | Endpoint | Frontend Call | Backend Handler |
|--------|----------|---------------|-----------------|
| GET | `/api/dashboard` | [Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L55), [Setup.jsx](frontend/src/pages/Setup.jsx#L21) | [dashboard.py](backend/routers/dashboard.py#L10) - get_dashboard() |

### Expense Routes (`/api/expenses/*`)
| Method | Endpoint | Frontend Call | Backend Handler |
|--------|----------|---------------|-----------------|
| GET | `/api/expenses/day/{date}` | [Calendar.jsx](frontend/src/pages/Calendar.jsx#L60) | [expenses.py](backend/routers/expenses.py) - get_expenses_by_day() |
| GET | `/api/expenses/{id}` | [EditExpense.jsx](frontend/src/pages/EditExpense.jsx#L34) | [expenses.py](backend/routers/expenses.py) - get_expense() |
| POST | `/api/expenses` | [Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L133), [History.jsx](frontend/src/pages/History.jsx#L94) | [expenses.py](backend/routers/expenses.py#L10) - add_expense() |
| PUT | `/api/expenses/{id}` | [Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L166) | [expenses.py](backend/routers/expenses.py) - update_expense() |
| DELETE | `/api/expenses/{id}` | [History.jsx](frontend/src/pages/History.jsx#L54) | [expenses.py](backend/routers/expenses.py) - delete_expense() |

### Budget Routes (`/api/budget/*`)
| Method | Endpoint | Frontend Call | Backend Handler |
|--------|----------|---------------|-----------------|
| POST | `/api/budget/setup` | [Setup.jsx](frontend/src/pages/Setup.jsx#L53) | [budget.py](backend/routers/budget.py#L8) - setup_budget() |
| POST | `/api/budget/salary` | [Setup.jsx](frontend/src/pages/Setup.jsx#L75) | [budget.py](backend/routers/budget.py) - update_salary() |
| POST | `/api/budget/percent` | [Setup.jsx](frontend/src/pages/Setup.jsx#L88) | [budget.py](backend/routers/budget.py) - update_percent() |

### Analysis Routes (`/api/analysis/*`)
| Method | Endpoint | Frontend Call | Backend Handler |
|--------|----------|---------------|-----------------|
| GET | `/api/analysis` | [Analysis.jsx](frontend/src/pages/Analysis.jsx#L39) | [analysis.py](backend/routers/analysis.py#L9) - get_analysis() |

### Health Check Routes
| Method | Endpoint | Purpose | Backend Handler |
|--------|----------|---------|-----------------|
| GET | `/api/health` | Service health | [main.py](backend/main.py#L63) - health_check() |

---

## Request Flow - Detailed Routing Path

### Development Environment (Vite)
```
Frontend Request:
  api.post('/auth/signup', {...})
  
↓ Generated URL: POST /api/auth/signup
↓ Vite Config (vite.config.js:72-76):
  /api → http://127.0.0.1:8000
  
↓ Proxied Request: POST http://127.0.0.1:8000/api/auth/signup
↓ Backend Receives:
  path: /api/auth/signup
  
↓ FastAPI Router Matching (main.py:47):
  include_router(auth.router, prefix="/api")
  auth.router.prefix = "/auth"
  
↓ Final Route: /api/auth/signup
↓ Handler (auth.py:34): @router.post("/signup", response_model=AuthResponse)
  
✅ Response: 200 OK {status: "success", user_id: 1, name: "User", ...}
```

### Production Environment (Vercel)
```
Frontend Request:
  api.post('/auth/signup', {...})
  
↓ Generated URL: POST /api/auth/signup
↓ Vercel Rewrite (vercel.json):
  /api/(.*) → /api [Vercel internal routing]
  
↓ Vercel Function Invocation:
  api/index.py (new handler)
  
↓ Handler Imports:
  from backend.main import app
  
↓ Request Reaches FastAPI:
  path: /api/auth/signup
  
↓ FastAPI Router Matching (main.py:47):
  include_router(auth.router, prefix="/api")
  auth.router.prefix = "/auth"
  
↓ Final Route: /api/auth/signup
↓ Handler (auth.py:34): @router.post("/signup", response_model=AuthResponse)
  
✅ Response: 200 OK {status: "success", user_id: 1, name: "User", ...}
```

---

## Deployment Architecture - After Fix

```
┌─────────────────────────────────────────────────────────────┐
│                    Vercel CDN (Production)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Build 1: Frontend                                          │
│  ├─ Source: frontend/package.json                           │
│  ├─ Output: frontend/dist/                                  │
│  ├─ Routes: /*, /index.html fallback                        │
│  └─ Serves: Static React SPA                               │
│                                                              │
│  Build 2: Backend API (FIXED)                               │
│  ├─ Source: api/index.py ← NEW                              │
│  ├─ Runtime: @vercel/python                                 │
│  ├─ Handler: FastAPI app from backend/main.py              │
│  └─ Routes: /api/* (via rewrite rule)                       │
│                                                              │
│  Rewrite Rule (FIXED):                                      │
│  ├─ /api/(.*) → /api [Vercel internal]                      │
│  └─ /(.*) → /index.html [SPA fallback]                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration Files - Validation

### ✅ frontend/src/services/api.js
```javascript
const api = axios.create({
  baseURL: '/api',  // ← Correct
  withCredentials: true,
});
```

### ✅ frontend/vite.config.js  
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8000',  // ← Correct for dev
      changeOrigin: true,
      secure: false,
    }
  }
}
```

### ✅ backend/main.py
```python
app.include_router(auth.router, prefix="/api")        # /api/auth
app.include_router(dashboard.router, prefix="/api")   # /api/dashboard
app.include_router(expenses.router, prefix="/api")    # /api/expenses
app.include_router(budget.router, prefix="/api")      # /api/budget
app.include_router(analysis.router, prefix="/api")    # /api/analysis
```

### ✅ api/index.py (NEW)
```python
from backend.main import app  # ← Imports FastAPI app
# Vercel exports this as the ASGI handler
```

### ✅ vercel.json (FIXED)
```json
{
  "builds": [
    {"src": "api/index.py", "use": "@vercel/python"}   // ← Was: backend/main.py
  ],
  "rewrites": [
    {"source": "/api/(.*)", "destination": "/api"}     // ← Was: /backend/main.py
  ]
}
```

---

## Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Frontend API Base URL | ✅ | `/api` correctly configured |
| Vite Dev Proxy | ✅ | `/api` → localhost:8000 |
| Backend Routes | ✅ | All prefixed with `/api` |
| Vercel Build Config | ✅ FIXED | Now builds from `api/index.py` |
| Vercel Rewrite Rule | ✅ FIXED | Now correctly routes to `/api` |
| API Handler | ✅ FIXED | New `api/index.py` provides handler |
| Firebase Config | ✅ FIXED | Env vars prefixed with `VITE_` |
| Manifest Icons | ✅ FIXED | PNG files correctly referenced |

All routes should now work correctly on both development and production!
