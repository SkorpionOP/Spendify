from fastapi import APIRouter, Depends, HTTPException
from datetime import date
from backend.models.db_wrapper import get_db, PostgresWrapper
from backend.routers.auth import get_current_user_id
from backend.schemas.budget import (
    BudgetSetup,
    SalaryUpdate,
    PercentUpdate,
    NeedsTopup,
    SavingsTopup,
)

router = APIRouter(prefix="/budget", tags=["Budget"])


@router.post("/setup")
def setup_budget(
    payload: BudgetSetup,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db),
):
    if payload.needs_percent + payload.savings_percent != 100:
        raise HTTPException(status_code=400, detail="Needs% + Savings% must equal 100")

    needs = payload.salary * (payload.needs_percent / 100)
    savings = payload.salary * (payload.savings_percent / 100)

    db.execute(
        """INSERT OR REPLACE INTO finance
           (user_id, salary, needs_percent, savings_percent, needs, savings)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            uid,
            payload.salary,
            payload.needs_percent,
            payload.savings_percent,
            needs,
            savings,
        ),
    )
    db.execute(
        """INSERT INTO monthly_budget (user_id, month, needs, savings)
           VALUES (?, ?, ?, ?)""",
        (uid, date.today().strftime("%Y-%m"), needs, savings),
    )
    db.commit()
    return {"status": "success", "message": "Budget configuration saved successfully."}


@router.post("/salary")
def update_salary(
    payload: SalaryUpdate,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db),
):
    finance = db.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (uid,)
    ).fetchone()

    if not finance:
        raise HTTPException(status_code=400, detail="Setup budget configuration first.")

    needs = payload.salary * (finance["needs_percent"] / 100)
    savings = payload.salary * (finance["savings_percent"] / 100)

    db.execute(
        "UPDATE finance SET salary=?, needs=?, savings=? WHERE user_id=?",
        (payload.salary, needs, savings, uid),
    )
    db.execute(
        "UPDATE monthly_budget SET needs=?, savings=? WHERE user_id=?",
        (needs, savings, uid),
    )
    db.commit()
    return {"status": "success", "message": "Salary updated successfully."}


@router.post("/percent")
def update_percent(
    payload: PercentUpdate,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db),
):
    if payload.needs_percent + payload.savings_percent != 100:
        raise HTTPException(status_code=400, detail="Needs + Savings must be 100")

    finance = db.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (uid,)
    ).fetchone()

    if not finance:
        raise HTTPException(status_code=400, detail="Setup budget configuration first.")

    salary = finance["salary"]
    needs = salary * (payload.needs_percent / 100)
    savings = salary * (payload.savings_percent / 100)

    db.execute(
        "UPDATE finance SET needs_percent=?, savings_percent=?, needs=?, savings=? WHERE user_id=?",
        (payload.needs_percent, payload.savings_percent, needs, savings, uid),
    )
    db.execute(
        "UPDATE monthly_budget SET needs=?, savings=? WHERE user_id=?",
        (needs, savings, uid),
    )
    db.commit()
    return {
        "status": "success",
        "message": "Budget allocation percents updated successfully.",
    }


@router.post("/topup-needs")
def topup_needs(
    payload: NeedsTopup,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db),
):
    finance = db.execute(
        "SELECT needs FROM finance WHERE user_id=? ORDER BY id DESC", (uid,)
    ).fetchone()

    if not finance:
        raise HTTPException(status_code=400, detail="Setup budget configuration first.")

    new_needs = finance["needs"] + payload.needs
    db.execute("UPDATE finance SET needs=? WHERE user_id=?", (new_needs, uid))
    db.execute("UPDATE monthly_budget SET needs=? WHERE user_id=?", (new_needs, uid))
    db.commit()
    return {
        "status": "success",
        "message": f"Added ₹{payload.needs:.0f} to your budget!",
    }


@router.post("/topup-savings")
def topup_savings(
    payload: SavingsTopup,
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db),
):
    finance = db.execute(
        "SELECT savings FROM finance WHERE user_id=? ORDER BY id DESC", (uid,)
    ).fetchone()

    if not finance:
        raise HTTPException(status_code=400, detail="Setup budget configuration first.")

    new_savings = finance["savings"] + payload.savings
    db.execute("UPDATE finance SET savings=? WHERE user_id=?", (new_savings, uid))
    db.execute(
        "UPDATE monthly_budget SET savings=? WHERE user_id=?", (new_savings, uid)
    )
    db.commit()
    return {
        "status": "success",
        "message": f"Added ₹{payload.savings:.0f} to your savings!",
    }
