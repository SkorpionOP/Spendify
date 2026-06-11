from datetime import datetime

def handle_new_month(user_id: int, conn, finance=None):
    current_month = datetime.today().strftime("%Y-%m")

    existing = conn.execute(
        "SELECT id FROM monthly_budget WHERE user_id=? AND month=?",
        (user_id, current_month)
    ).fetchone()

    if existing:
        return

    last = conn.execute(
        "SELECT * FROM monthly_budget WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()

    carry_forward = 0

    if last:
        last_month = last['month']
        total = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id=? AND date LIKE ?",
            (user_id, last_month + "%")
        ).fetchone()
        total_spent = total['total']
        old_needs = last['needs']
        old_savings = last['savings']
        if total_spent <= old_needs:
            carry_forward = (old_needs - total_spent) + old_savings
        else:
            carry_forward = max(0, old_savings - (total_spent - old_needs))

    if not finance:
        finance = conn.execute(
            "SELECT salary, needs_percent, savings_percent FROM finance WHERE user_id=?", (user_id,)
        ).fetchone()

    if not finance:
        return

    salary = finance['salary']
    needs = salary * (finance['needs_percent'] / 100)
    savings = salary * (finance['savings_percent'] / 100) + carry_forward

    conn.execute(
        "INSERT INTO monthly_budget (user_id, month, needs, savings) VALUES (?, ?, ?, ?)",
        (user_id, current_month, needs, savings)
    )
    conn.execute(
        "UPDATE finance SET needs=?, savings=? WHERE user_id=?",
        (needs, savings, user_id)
    )
    conn.commit()
