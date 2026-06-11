from fastapi import APIRouter, Depends, Query
from datetime import datetime
from typing import Optional
from backend.models.db_wrapper import get_db, PostgresWrapper
from backend.routers.auth import get_current_user_id

router = APIRouter(prefix="/analysis", tags=["Analysis"])

@router.get("")
def get_analysis(
    month: Optional[str] = Query(None),
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db)
):
    if not month:
        today = datetime.today()
        month = f"{today.year}-{today.month:02d}"

    categories = db.execute(
        """SELECT category, SUM(amount) as total FROM expenses
           WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC""",
        (uid, f"{month}%")
    ).fetchall()

    daily_stats = db.execute(
        """SELECT date, SUM(amount) as total FROM expenses
           WHERE user_id=? AND date LIKE ? GROUP BY date ORDER BY date ASC""",
        (uid, f"{month}%")
    ).fetchall()

    finance = db.execute(
        "SELECT needs FROM finance WHERE user_id=?", (uid,)
    ).fetchone()

    needs_budget = finance['needs'] if finance else 0
    total_spent = sum(c['total'] for c in categories)
    num_days = len(daily_stats) or 1
    daily_avg = total_spent / num_days
    
    daily_dates = [d['date'][-2:] for d in daily_stats]
    daily_totals = [d['total'] for d in daily_stats]
    labels = [c['category'] for c in categories]
    values = [c['total'] for c in categories]

    return {
        "month": month,
        "total_spent": total_spent,
        "categories": categories,
        "daily_avg": daily_avg,
        "needs": needs_budget,
        "labels": labels,
        "values": values,
        "daily_dates": daily_dates,
        "daily_totals": daily_totals
    }
