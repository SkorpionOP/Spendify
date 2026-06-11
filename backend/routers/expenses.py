from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import date, datetime
from typing import Optional
from backend.models.db_wrapper import get_db, PostgresWrapper
from backend.routers.auth import get_current_user_id
from backend.schemas.expenses import ExpenseCreate, ExpenseUpdate, ExpenseResponse

router = APIRouter(prefix="/expenses", tags=["Expenses"])

@router.post("", status_code=201)
def add_expense(payload: ExpenseCreate, uid: int = Depends(get_current_user_id), db: PostgresWrapper = Depends(get_db)):
    amount = payload.amount
    category = payload.category
    note = payload.note or ""
    expense_date = payload.expense_date or date.today().strftime("%Y-%m-%d")

    finance = db.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (uid,)
    ).fetchone()

    if not finance:
        raise HTTPException(status_code=400, detail="Please setup your budget configuration first.")

    needs = finance['needs']
    savings = finance['savings']

    current_month = datetime.today().strftime("%Y-%m")
    total = db.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ?",
        (uid, current_month + '%')
    ).fetchone()
    total_spent = total['total'] if total['total'] else 0
    remaining_needs = needs - total_spent
    savings_used_now = 0

    if amount > remaining_needs:
        savings_used_now = int(amount - remaining_needs)
        if savings_used_now > savings:
            raise HTTPException(
                status_code=400,
                detail="❌ Not enough savings! Transaction cancelled."
            )

    db.execute(
        "INSERT INTO expenses (user_id, amount, category, note, date) VALUES (?, ?, ?, ?, ?)",
        (uid, amount, category, note, expense_date)
    )
    db.commit()

    alert_message = None
    if savings_used_now > 0:
        alert_message = f"💳 ₹{savings_used_now} has been drawn from your savings."

    return {
        "status": "success",
        "message": "Expense logged successfully.",
        "alert": alert_message
    }

@router.get("/history")
def get_history(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db)
):
    if start_date and end_date:
        records = db.execute(
            "SELECT * FROM expenses WHERE user_id=? AND date >= ? AND date <= ? ORDER BY date DESC, id DESC",
            (uid, start_date, end_date)
        ).fetchall()
        total = sum(r['amount'] for r in records)
        return {"records": records, "total": total}
    else:
        months = db.execute(
            """SELECT substr(date, 1, 7) as month, SUM(amount) as total
               FROM expenses WHERE user_id=?
               GROUP BY month ORDER BY month DESC""",
            (uid,)
        ).fetchall()
        # Also return last 100 transactions for a seamless dashboard/history default view in React
        recent_records = db.execute(
            "SELECT * FROM expenses WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 100",
            (uid,)
        ).fetchall()
        return {"months": months, "records": recent_records}

@router.get("/day/{selected_date}")
def get_day_expenses(
    selected_date: str,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db)
):
    expenses = db.execute(
        "SELECT * FROM expenses WHERE user_id=? AND date=? ORDER BY id DESC",
        (uid, selected_date)
    ).fetchall()

    total = db.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date=?",
        (uid, selected_date)
    ).fetchone()
    total_spent = total['total'] if total['total'] else 0

    categories = db.execute(
        "SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date=? GROUP BY category",
        (uid, selected_date)
    ).fetchall()

    return {
        "expenses": expenses,
        "total_spent": total_spent,
        "categories": categories,
        "selected_date": selected_date
    }

@router.get("/{expense_id}", response_model=ExpenseResponse)
def get_expense(
    expense_id: int,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db)
):
    expense = db.execute(
        "SELECT * FROM expenses WHERE id=? AND user_id=?", (expense_id, uid)
    ).fetchone()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found.")
    return expense

@router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db)
):
    # Check if expense exists
    expense = db.execute(
        "SELECT * FROM expenses WHERE id=? AND user_id=?", (expense_id, uid)
    ).fetchone()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found.")

    db.execute(
        "UPDATE expenses SET amount=?, category=?, note=? WHERE id=? AND user_id=?",
        (payload.amount, payload.category, payload.note, expense_id, uid)
    )
    db.commit()
    return {"status": "success", "message": "Expense updated successfully."}

@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db)
):
    # Check if expense exists
    expense = db.execute(
        "SELECT * FROM expenses WHERE id=? AND user_id=?", (expense_id, uid)
    ).fetchone()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found.")

    db.execute("DELETE FROM expenses WHERE id=? AND user_id=?", (expense_id, uid))
    db.commit()
    return {"status": "success", "message": "Expense deleted successfully."}
