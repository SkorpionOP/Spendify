from pydantic import BaseModel, Field


class BudgetSetup(BaseModel):
    salary: float = Field(..., gt=0)
    needs_percent: float = Field(..., ge=0, le=100)
    savings_percent: float = Field(..., ge=0, le=100)


class SalaryUpdate(BaseModel):
    salary: float = Field(..., gt=0)


class PercentUpdate(BaseModel):
    needs_percent: float = Field(..., ge=0, le=100)
    savings_percent: float = Field(..., ge=0, le=100)


class NeedsTopup(BaseModel):
    needs: float = Field(..., gt=0)


class SavingsTopup(BaseModel):
    savings: float = Field(..., gt=0)
