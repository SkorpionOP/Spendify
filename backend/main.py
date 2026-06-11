import sys
import os
import traceback

# Add parent directory of 'backend' to sys.path for local development
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

# In Vercel serverless functions, 'backend' folder contents might be deployed to root.
# We alias 'backend' to the current directory to fix module imports.
import types
try:
    import backend
except ImportError:
    backend_module = types.ModuleType('backend')
    backend_module.__path__ = [current_dir]
    sys.modules['backend'] = backend_module

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database.tables import init_tables
from backend.routers import auth, dashboard, expenses, budget, analysis

app = FastAPI(
    title="Spendly API",
    description="REST API backend for Spendly Personal Expense Tracker",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Table Initialization
@app.on_event("startup")
def startup_event():
    init_tables()

# Root Healthcheck
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "Spendly API"}

# Include Routers
app.include_router(auth.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(budget.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
