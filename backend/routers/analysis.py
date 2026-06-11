from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta
from typing import Optional
from backend.models.db_wrapper import get_db, PostgresWrapper
from backend.routers.auth import get_current_user_id

router = APIRouter(prefix="/analysis", tags=["Analysis"])

@router.get("")
def get_analysis(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    uid: int = Depends(get_current_user_id),
    db: PostgresWrapper = Depends(get_db)
):
    today = datetime.today()
    if not start_date or not end_date:
        if month:
            start_date = f"{month}-01"
            # Get last day of month
            year, m = map(int, month.split('-'))
            if m == 12:
                end_date = f"{year+1}-01-01"
            else:
                end_date = f"{year}-{m+1:02d}-01"
            # Subtract 1 day to get the exact last day
            end_date = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        else:
            start_date = f"{today.year}-{today.month:02d}-01"
            if today.month == 12:
                next_month = datetime(today.year + 1, 1, 1)
            else:
                next_month = datetime(today.year, today.month + 1, 1)
            end_date = (next_month - timedelta(days=1)).strftime("%Y-%m-%d")

    categories = db.execute(
        """SELECT category, SUM(amount) as total FROM expenses
           WHERE user_id=? AND date >= ? AND date <= ? GROUP BY category ORDER BY total DESC""",
        (uid, start_date, end_date)
    ).fetchall()

    daily_stats = db.execute(
        """SELECT date, SUM(amount) as total FROM expenses
           WHERE user_id=? AND date >= ? AND date <= ? GROUP BY date ORDER BY date ASC""",
        (uid, start_date, end_date)
    ).fetchall()

    finance = db.execute(
        "SELECT needs, salary FROM finance WHERE user_id=?", (uid,)
    ).fetchone()

    needs_budget = finance['needs'] if finance else 0
    salary = finance['salary'] if finance else 0
    total_spent = sum(c['total'] for c in categories)
    
    highest_tx = db.execute(
        """SELECT id, amount, category, note, date FROM expenses 
           WHERE user_id=? AND date >= ? AND date <= ? 
           ORDER BY amount DESC LIMIT 1""",
        (uid, start_date, end_date)
    ).fetchone()

    # Calculate daily avg and previous period stats based on date range difference
    try:
        d1 = datetime.strptime(start_date, "%Y-%m-%d")
        d2 = datetime.strptime(end_date, "%Y-%m-%d")
        days_diff = (d2 - d1).days + 1
        num_days = max(1, days_diff)
        
        # Previous period calculation
        prev_d2 = d1 - timedelta(days=1)
        prev_d1 = prev_d2 - timedelta(days=days_diff - 1)
        prev_total = db.execute(
            """SELECT SUM(amount) as total FROM expenses
               WHERE user_id=? AND date >= ? AND date <= ?""",
            (uid, prev_d1.strftime("%Y-%m-%d"), prev_d2.strftime("%Y-%m-%d"))
        ).fetchone()
        prev_spent = prev_total['total'] if prev_total and prev_total['total'] else 0
    except:
        num_days = len(daily_stats) or 1
        prev_spent = 0
        
    daily_avg = total_spent / num_days
    
    daily_dates = [d['date'][-2:] for d in daily_stats]
    daily_totals = [d['total'] for d in daily_stats]
    labels = [c['category'] for c in categories]
    values = [c['total'] for c in categories]

    # Calculate Month-over-Month / Period-over-Period change
    spend_delta_pct = 0
    if prev_spent > 0:
        spend_delta_pct = ((total_spent - prev_spent) / prev_spent) * 100
    elif total_spent > 0 and prev_spent == 0:
        spend_delta_pct = 100

    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_spent": total_spent,
        "prev_spent": prev_spent,
        "spend_delta_pct": spend_delta_pct,
        "categories": categories,
        "highest_tx": highest_tx,
        "salary": salary,
        "daily_avg": daily_avg,
        "needs": needs_budget,
        "labels": labels,
        "values": values,
        "daily_dates": daily_dates,
        "daily_totals": daily_totals
    }
