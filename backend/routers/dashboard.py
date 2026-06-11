from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta
from typing import Optional
from backend.models.db_wrapper import get_db, PostgresWrapper
from backend.routers.auth import get_current_user_id
from backend.services.carry_forward import handle_new_month

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("")
def get_dashboard(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    uid: int = Depends(get_current_user_id), 
    db: PostgresWrapper = Depends(get_db)
):
    today = datetime.today()
    if not start_date or not end_date:
        start_date = f"{today.year}-{today.month:02d}-01"
        if today.month == 12:
            next_month = datetime(today.year + 1, 1, 1)
        else:
            next_month = datetime(today.year, today.month + 1, 1)
        end_date = (next_month - timedelta(days=1)).strftime("%Y-%m-%d")

    finance = db.execute(
        "SELECT * FROM finance WHERE user_id=?", (uid,)
    ).fetchone()

    if not finance or finance.get('salary') is None:
        return {"needs_setup": True}

    # Execute carry-forward logic
    handle_new_month(uid, db, finance)

    # Consolidated stats query based on date range
    row = db.execute("""
        SELECT
            f.needs, f.savings, f.salary,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id=%s AND date >= %s AND date <= %s), 0) AS month_spent,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id=%s), 0) AS total_ever,
            (SELECT category FROM expenses WHERE user_id=%s AND date >= %s AND date <= %s GROUP BY category ORDER BY SUM(amount) DESC LIMIT 1) AS top_category,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id=%s AND date >= %s AND date <= %s GROUP BY category ORDER BY SUM(amount) DESC LIMIT 1), 0) AS top_category_total
        FROM finance f WHERE f.user_id=%s
    """, (uid, start_date, end_date, uid, uid, start_date, end_date, uid, start_date, end_date, uid)).fetchone()

    expenses = db.execute(
        "SELECT * FROM expenses WHERE user_id=? AND date >= ? AND date <= ? ORDER BY date DESC, id DESC LIMIT 10", 
        (uid, start_date, end_date)
    ).fetchall()

    top_cat = None
    if row.get('top_category'):
        top_cat = {
            'category': row['top_category'],
            'total': row['top_category_total']
        }

    needs = row['needs']
    savings = row['savings']
    total_spent = row['month_spent']

    if total_spent <= needs:
        used_needs = total_spent
        savings_used = 0
    else:
        used_needs = needs
        savings_used = total_spent - needs

    remaining_needs = needs - used_needs
    remaining_savings = savings - savings_used
    usage_percent = round((total_spent / needs) * 100, 2) if needs > 0 else 0

    alert = None
    if usage_percent >= 100:
        alert = f"🚨 You have used {usage_percent}% of your budget — dipping into savings!"
    elif usage_percent >= 90:
        alert = f"⚠️ You've used {usage_percent}% of your budget. Almost there!"
    elif usage_percent >= 50:
        alert = f"⚠️ You've used {usage_percent}% of your monthly budget."

    return {
        "needs_setup": False,
        "salary": row['salary'],
        "needs": needs,
        "savings": savings,
        "total_spent": total_spent,
        "remaining_needs": remaining_needs,
        "remaining_savings": remaining_savings,
        "savings_used": savings_used,
        "usage_percent": usage_percent,
        "top_category": top_cat,
        "alert": alert,
        "expenses": expenses,
        "now_hour": today.hour
    }
