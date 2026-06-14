from pydantic import BaseModel
from typing import Optional


class ExpenseCreate(BaseModel):
    amount: float
    category: str
    note: Optional[str] = ""
    expense_date: Optional[str] = None


class ExpenseUpdate(BaseModel):
    amount: float
    category: str
    note: Optional[str] = ""


class ExpenseResponse(BaseModel):
    id: int
    user_id: int
    amount: float
    category: str
    note: str
    date: str

    class Config:
        from_attributes = True
