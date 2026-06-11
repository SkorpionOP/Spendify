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
# In production, this should be restricted to the frontend hosting domain.
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
