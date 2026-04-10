from flask import Flask, render_template, request, redirect, session
import psycopg2
from psycopg2.extras import DictCursor
from datetime import date, datetime
import calendar
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = "secret123"

# -----------------------------
# CATEGORY EMOJI HELPER
# -----------------------------
CATEGORY_EMOJIS = {
    'Food': '🍔', 'Transport': '🚗', 'Shopping': '🛍️', 'Bills': '⚡',
    'Entertainment': '🎬', 'Health': '💊', 'Education': '📚', 'Groceries': '🛒',
    'Fitness': '🏋️', 'Travel': '✈️', 'Rent': '🏠', 'Subscriptions': '📱',
    'Dining Out': '🍽️', 'Beauty': '💄', 'Pets': '🐾', 'Gifts': '🎁',
    'Investment': '📊', 'Others': '📦',
}

def cat_emoji(category):
    return CATEGORY_EMOJIS.get(category, '📦')

app.jinja_env.globals['cat_emoji'] = cat_emoji

# -----------------------------
# DATABASE CONNECTION (POSTGRESQL)
# -----------------------------
class PostgresWrapper:
    def __init__(self, conn):
        self.conn = conn
    
    def execute(self, query, params=None):
        query = query.replace('?', '%s')
        if "INSERT OR REPLACE INTO finance" in query:
            query = """
                INSERT INTO finance (user_id, salary, needs_percent, savings_percent, needs, savings)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id) 
                DO UPDATE SET salary=EXCLUDED.salary, needs_percent=EXCLUDED.needs_percent, 
                savings_percent=EXCLUDED.savings_percent, needs=EXCLUDED.needs, savings=EXCLUDED.savings
            """
        cursor = self.conn.cursor()
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        self.last_cursor = cursor
        return self

    def fetchone(self):
        row = self.last_cursor.fetchone()
        return dict(row) if row else None

    def fetchall(self):
        rows = self.last_cursor.fetchall()
        return [dict(row) for row in rows]
        
    def commit(self):
        self.conn.commit()
        
    def close(self):
        self.conn.close()

def get_db_connection():
    db_url = os.environ.get("DATABASE_URL")
    conn = psycopg2.connect(db_url, cursor_factory=DictCursor)
    return PostgresWrapper(conn)

# Initialize tables
try:
    _init_conn = get_db_connection()
    _init_conn.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            message TEXT,
            date TEXT
        )
    ''')
    _init_conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            uid TEXT UNIQUE,
            name TEXT,
            profile_pic TEXT
        )
    ''')
    _init_conn.execute('''
        CREATE TABLE IF NOT EXISTS finance (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE,
            salary REAL,
            needs_percent REAL,
            savings_percent REAL,
            needs REAL,
            savings REAL
        )
    ''')
    _init_conn.execute('''
        CREATE TABLE IF NOT EXISTS monthly_budget (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            month TEXT,
            needs REAL,
            savings REAL
        )
    ''')
    _init_conn.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            amount REAL,
            category TEXT,
            note TEXT DEFAULT '',
            date TEXT
        )
    ''')
    _init_conn.commit()
    _init_conn.close()
except Exception as e:
    print("Database initialization error:", e)


def handle_new_month(user_id):
    conn = get_db_connection()
    current_month = datetime.today().strftime("%Y-%m")

    existing = conn.execute(
        "SELECT * FROM monthly_budget WHERE user_id=? AND month=?",
        (user_id, current_month)
    ).fetchone()

    if existing:
        conn.close()
        return

    last = conn.execute(
        "SELECT * FROM monthly_budget WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()

    carry_forward = 0

    if last:
        last_month = last['month']
        total = conn.execute(
            "SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ?",
            (user_id, last_month + "%")
        ).fetchone()
        total_spent = total['total'] if total['total'] else 0
        old_needs = last['needs']
        old_savings = last['savings']
        if total_spent <= old_needs:
            remaining_needs = old_needs - total_spent
            remaining_savings = old_savings
        else:
            remaining_needs = 0
            extra = total_spent - old_needs
            remaining_savings = old_savings - extra
        carry_forward = remaining_needs + remaining_savings

    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (user_id,)
    ).fetchone()

    salary = finance['salary']
    needs_percent = finance['needs_percent']
    savings_percent = finance['savings_percent']
    needs = salary * (needs_percent / 100)
    savings = salary * (savings_percent / 100) + carry_forward

    conn.execute(
        "INSERT INTO monthly_budget (user_id, month, needs, savings) VALUES (?, ?, ?, ?)",
        (user_id, current_month, needs, savings)
    )
    conn.execute(
        "UPDATE finance SET needs=?, savings=? WHERE user_id=?",
        (needs, savings, user_id)
    )
    conn.commit()
    conn.close()

@app.context_processor
def inject_firebase_config():
    return dict(
        FIREBASE_API_KEY=os.getenv('FIREBASE_API_KEY'),
        FIREBASE_AUTH_DOMAIN=os.getenv('FIREBASE_AUTH_DOMAIN'),
        FIREBASE_PROJECT_ID=os.getenv('FIREBASE_PROJECT_ID'),
        FIREBASE_STORAGE_BUCKET=os.getenv('FIREBASE_STORAGE_BUCKET'),
        FIREBASE_MESSAGING_SENDER_ID=os.getenv('FIREBASE_MESSAGING_SENDER_ID'),
        FIREBASE_APP_ID=os.getenv('FIREBASE_APP_ID'),
        FIREBASE_MEASUREMENT_ID=os.getenv('FIREBASE_MEASUREMENT_ID')
    )

# -----------------------------
# LANDING PAGE
# -----------------------------
@app.route('/')
def home():
    if 'user_id' in session:
        return redirect('/dashboard')
    return render_template('landing.html')

# -----------------------------
# SIGNUP
# -----------------------------
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        conn = get_db_connection()
        try:
            conn.execute(
                "INSERT INTO users (email, password) VALUES (?, ?)",
                (email, password)
            )
            conn.commit()
            conn.close()
            return redirect('/login')
        except:
            conn.close()
            return render_template('signup.html', error="Email already registered.")
    return render_template('signup.html')

# -----------------------------
# LOGIN
# -----------------------------
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        conn = get_db_connection()
        user = conn.execute(
            "SELECT * FROM users WHERE email=? AND password=?",
            (email, password)
        ).fetchone()
        conn.close()
        if user:
            session['user_id'] = user['id']
            return redirect('/dashboard')
        else:
            return render_template('login.html', error="Invalid email or password.")
    return render_template('login.html')

# -----------------------------
# FIREBASE AUTH
# -----------------------------
@app.route('/auth/firebase', methods=['POST'])
def auth_firebase():
    data = request.json
    uid = data.get('uid')
    email = data.get('email')
    name = data.get('name')
    profile_pic = data.get('profile_pic')

    if not uid:
        return {"status": "error", "message": "Missing credentials"}, 400

    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()

    if not user:
        # Check if email exists to link account
        if email:
            user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if user:
                conn.execute(
                    "UPDATE users SET uid=?, name=?, profile_pic=? WHERE email=?",
                    (uid, name, profile_pic, email)
                )
            else:
                conn.execute(
                    "INSERT INTO users (email, uid, name, profile_pic) VALUES (?, ?, ?, ?)",
                    (email, uid, name, profile_pic)
                )
        else:
            conn.execute(
                "INSERT INTO users (uid, name, profile_pic) VALUES (?, ?, ?)",
                (uid, name, profile_pic)
            )
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()

    session['user_id'] = user['id']
    session['profile_pic'] = user['profile_pic']
    session['name'] = user['name']
    conn.close()
    return {"status": "success"}

# -----------------------------
# DASHBOARD
# -----------------------------
@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect('/login')

    today = datetime.today()
    year = today.year
    month = today.month
    month_str = f"{year}-{month:02d}"

    conn = get_db_connection()
    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()

    if not finance or finance['salary'] is None:
        if conn: conn.close()
        return redirect('/setup')

    handle_new_month(session['user_id'])

    # Reload finance after month handling
    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()

    expenses = conn.execute(
        "SELECT * FROM expenses WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 10",
        (session['user_id'],)
    ).fetchall()

    categories = conn.execute(
        """SELECT category, SUM(amount) as total
           FROM expenses WHERE user_id=?
           GROUP BY category""",
        (session['user_id'],)
    ).fetchall()

    top_category = None
    if categories:
        top_category = max(categories, key=lambda x: x['total'])

    total = conn.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ?",
        (session['user_id'], month_str + "%")
    ).fetchone()

    conn.close()

    total_spent = total['total'] if total['total'] else 0
    needs = finance['needs']
    savings = finance['savings']

    if total_spent <= needs:
        used_needs = total_spent
        savings_used = 0
    else:
        used_needs = needs
        savings_used = total_spent - needs

    remaining_needs = needs - used_needs
    remaining_savings = savings - savings_used
    usage_percent = round((total_spent / needs) * 100, 2) if needs > 0 else 0

    alert = session.pop('alert', None)
    if not alert:
        if usage_percent >= 100:
            alert = f"🚨 You have used {usage_percent}% of your budget — dipping into savings!"
        elif usage_percent >= 90:
            alert = f"⚠️ You've used {usage_percent}% of your budget. Almost there!"
        elif usage_percent >= 50:
            alert = f"⚠️ You've used {usage_percent}% of your monthly budget."

    return render_template(
        'dashboard.html',
        finance=finance,
        expenses=expenses,
        total_spent=total_spent,
        remaining_needs=remaining_needs,
        remaining_savings=remaining_savings,
        savings_used=savings_used,
        top_category=top_category,
        alert=alert
    )

# -----------------------------
# FINANCE SETUP
# -----------------------------
@app.route('/setup', methods=['GET', 'POST'])
def setup():
    if 'user_id' not in session:
        return redirect('/login')

    if request.method == 'POST':
        salary = float(request.form['salary'])
        needs_percent = float(request.form['needs_percent'])
        savings_percent = float(request.form['savings_percent'])

        if needs_percent + savings_percent != 100:
            return "❌ Needs% + Savings% must equal 100"

        needs = salary * (needs_percent / 100)
        savings = salary * (savings_percent / 100)

        conn = get_db_connection()
        conn.execute(
            """INSERT OR REPLACE INTO finance
               (user_id, salary, needs_percent, savings_percent, needs, savings)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session['user_id'], salary, needs_percent, savings_percent, needs, savings)
        )
        conn.execute(
            """INSERT INTO monthly_budget (user_id, month, needs, savings)
               VALUES (?, ?, ?, ?)""",
            (session['user_id'], date.today().strftime("%Y-%m"), needs, savings)
        )
        conn.commit()
        conn.close()
        return redirect('/dashboard')

    return render_template('setup.html')

@app.route('/update_salary', methods=['POST'])
def update_salary():
    if 'user_id' not in session:
        return redirect('/login')

    salary = float(request.form['salary'])
    conn = get_db_connection()
    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()

    if not finance:
        conn.close()
        return redirect('/setup')

    needs = salary * (finance['needs_percent'] / 100)
    savings = salary * (finance['savings_percent'] / 100)

    conn.execute(
        "UPDATE finance SET salary=?, needs=?, savings=? WHERE user_id=?",
        (salary, needs, savings, session['user_id'])
    )
    conn.execute(
        "UPDATE monthly_budget SET needs=?, savings=? WHERE user_id=?",
        (needs, savings, session['user_id'])
    )
    conn.commit()
    conn.close()
    return redirect('/dashboard')

@app.route('/update_percent', methods=['POST'])
def update_percent():
    if 'user_id' not in session:
        return redirect('/login')

    needs_percent = float(request.form['needs_percent'])
    savings_percent = float(request.form['savings_percent'])

    if needs_percent + savings_percent != 100:
        return "❌ Needs + Savings must be 100"

    conn = get_db_connection()
    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()

    if not finance:
        conn.close()
        return redirect('/setup')

    salary = finance['salary']
    needs = salary * (needs_percent / 100)
    savings = salary * (savings_percent / 100)

    conn.execute(
        "UPDATE finance SET needs_percent=?, savings_percent=?, needs=?, savings=? WHERE user_id=?",
        (needs_percent, savings_percent, needs, savings, session['user_id'])
    )
    conn.execute(
        "UPDATE monthly_budget SET needs=?, savings=? WHERE user_id=?",
        (needs, savings, session['user_id'])
    )
    conn.commit()
    conn.close()
    return redirect('/dashboard')

# -----------------------------
# ADD EXPENSE
# -----------------------------
@app.route('/add', methods=['POST'])
def add_expense():
    if 'user_id' not in session:
        return redirect('/login')

    amount = float(request.form['amount'])
    category = request.form['category']
    note = request.form.get('note', '')
    expense_date = request.form.get('expense_date', '') or date.today().strftime("%Y-%m-%d")

    conn = get_db_connection()
    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()

    needs = finance['needs']
    savings = finance['savings']

    total = conn.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id=?",
        (session['user_id'],)
    ).fetchone()
    total_spent = total['total'] if total['total'] else 0
    remaining_needs = needs - total_spent
    savings_used_now = 0

    if amount > remaining_needs:
        savings_used_now = int(amount - remaining_needs)
        if savings_used_now > savings:
            session['alert'] = "❌ Not enough savings! Transaction cancelled."
            conn.close()
            return redirect('/dashboard')

    conn.execute(
        "INSERT INTO expenses (user_id, amount, category, note, date) VALUES (?, ?, ?, ?, ?)",
        (session['user_id'], amount, category, note, expense_date)
    )
    conn.commit()
    conn.close()

    if savings_used_now > 0:
        session['alert'] = f"💳 ₹{savings_used_now} has been drawn from your savings."

    return redirect('/dashboard')

@app.route('/add_needs', methods=['POST'])
def add_needs():
    if 'user_id' not in session:
        return redirect('/login')

    add_amount = float(request.form['needs'])
    conn = get_db_connection()
    finance = conn.execute(
        "SELECT needs FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()
    new_needs = finance['needs'] + add_amount
    conn.execute("UPDATE finance SET needs=? WHERE user_id=?", (new_needs, session['user_id']))
    conn.execute("UPDATE monthly_budget SET needs=? WHERE user_id=?", (new_needs, session['user_id']))
    conn.commit()
    conn.close()
    session['alert'] = f"✅ Added ₹{add_amount:.0f} to your budget!"
    return redirect('/dashboard')

@app.route('/add_savings', methods=['POST'])
def add_savings():
    if 'user_id' not in session:
        return redirect('/login')

    add_amount = float(request.form['savings'])
    conn = get_db_connection()
    finance = conn.execute(
        "SELECT savings FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()
    new_savings = finance['savings'] + add_amount
    conn.execute("UPDATE finance SET savings=? WHERE user_id=?", (new_savings, session['user_id']))
    conn.execute("UPDATE monthly_budget SET savings=? WHERE user_id=?", (new_savings, session['user_id']))
    conn.commit()
    conn.close()
    session['alert'] = f"✅ Added ₹{add_amount:.0f} to your savings!"
    return redirect('/dashboard')

@app.route('/delete/<int:id>')
def delete_expense(id):
    if 'user_id' not in session:
        return redirect('/login')
    conn = get_db_connection()
    conn.execute("DELETE FROM expenses WHERE id=? AND user_id=?", (id, session['user_id']))
    conn.commit()
    conn.close()
    session['alert'] = "🗑️ Expense deleted."
    return redirect('/dashboard')

@app.route('/edit/<int:id>', methods=['GET', 'POST'])
def edit_expense(id):
    if 'user_id' not in session:
        return redirect('/login')
    conn = get_db_connection()

    if request.method == 'POST':
        amount = float(request.form['amount'])
        category = request.form['category']
        note = request.form.get('note', '')
        conn.execute(
            "UPDATE expenses SET amount=?, category=?, note=? WHERE id=? AND user_id=?",
            (amount, category, note, id, session['user_id'])
        )
        conn.commit()
        conn.close()
        session['alert'] = "✅ Expense updated!"
        return redirect('/dashboard')

    expense = conn.execute(
        "SELECT * FROM expenses WHERE id=? AND user_id=?", (id, session['user_id'])
    ).fetchone()
    conn.close()

    if not expense:
        return redirect('/dashboard')
    return render_template('edit.html', exp=expense)

# -----------------------------
# CALENDAR VIEW
# -----------------------------
@app.route('/calendar')
def calendar_view():
    if 'user_id' not in session:
        return redirect('/login')

    today = datetime.today()
    year = today.year
    month = today.month

    num_days = calendar.monthrange(year, month)[1]
    days = list(range(1, num_days + 1))
    offset = calendar.monthrange(year, month)[0]  # 0=Mon ... 6=Sun → convert to Sun-first
    offset = (offset + 1) % 7  # Sunday = 0

    month_name = today.strftime("%B")

    return render_template(
        'calendar.html',
        days=days, year=year, month=month,
        month_name=month_name,
        offset=offset,
        today_day=today.day
    )

# -----------------------------
# DAY VIEW
# -----------------------------
@app.route('/day/<selected_date>')
def day_view(selected_date):
    if 'user_id' not in session:
        return redirect('/login')

    conn = get_db_connection()

    expenses = conn.execute(
        "SELECT * FROM expenses WHERE user_id=? AND date=? ORDER BY id DESC",
        (session['user_id'], selected_date)
    ).fetchall()

    total = conn.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date=?",
        (session['user_id'], selected_date)
    ).fetchone()

    categories = conn.execute(
        "SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date=? GROUP BY category",
        (session['user_id'], selected_date)
    ).fetchall()

    conn.close()
    total_spent = total['total'] if total['total'] else 0

    return render_template(
        'day.html',
        expenses=expenses,
        total_spent=total_spent,
        categories=categories,
        selected_date=selected_date
    )

# -----------------------------
# MONTHLY ANALYSIS
# -----------------------------
@app.route('/analysis')
def analysis():
    if 'user_id' not in session:
        return redirect('/login')

    conn = get_db_connection()
    today = datetime.today()
    month_str = f"{today.year}-{today.month:02d}"

    total = conn.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ?",
        (session['user_id'], f"{month_str}%")
    ).fetchone()
    total_spent = total['total'] if total['total'] else 0

    categories = conn.execute(
        """SELECT category, SUM(amount) as total FROM expenses
           WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC""",
        (session['user_id'], f"{month_str}%")
    ).fetchall()

    days_row = conn.execute(
        "SELECT COUNT(DISTINCT date) as days FROM expenses WHERE user_id=? AND date LIKE ?",
        (session['user_id'], f"{month_str}%")
    ).fetchone()

    num_days = days_row['days'] if days_row['days'] else 1
    daily_avg = total_spent / num_days

    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()

    # Daily trend logic
    daily_stats = conn.execute(
        """SELECT date, SUM(amount) as total FROM expenses
           WHERE user_id=? AND date LIKE ? GROUP BY date ORDER BY date ASC""",
        (session['user_id'], f"{month_str}%")
    ).fetchall()

    daily_dates = [d['date'][-2:] for d in daily_stats]
    daily_totals = [d['total'] for d in daily_stats]

    labels = [cat['category'] for cat in categories]
    values = [cat['total'] for cat in categories]
    conn.close()

    return render_template(
        'analysis.html',
        total_spent=total_spent,
        categories=categories,
        daily_avg=daily_avg,
        needs=finance['needs'],
        labels=labels,
        values=values,
        daily_dates=daily_dates,
        daily_totals=daily_totals
    )

# -----------------------------
# HISTORY PAGE
# -----------------------------
@app.route('/history')
def history():
    if 'user_id' not in session:
        return redirect('/login')

    conn = get_db_connection()
    months = conn.execute(
        """SELECT substr(date, 1, 7) as month, SUM(amount) as total
           FROM expenses WHERE user_id=?
           GROUP BY month ORDER BY month DESC""",
        (session['user_id'],)
    ).fetchall()
    conn.close()

    return render_template('history.html', months=months)

# -----------------------------
# ANALYSIS BY MONTH
# -----------------------------
@app.route('/analysis/<month>')
def analysis_by_month(month):
    if 'user_id' not in session:
        return redirect('/login')

    conn = get_db_connection()
    total = conn.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ?",
        (session['user_id'], f"{month}%")
    ).fetchone()
    total_spent = total['total'] if total['total'] else 0

    categories = conn.execute(
        """SELECT category, SUM(amount) as total FROM expenses
           WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC""",
        (session['user_id'], f"{month}%")
    ).fetchall()

    days_row = conn.execute(
        "SELECT COUNT(DISTINCT date) as days FROM expenses WHERE user_id=? AND date LIKE ?",
        (session['user_id'], f"{month}%")
    ).fetchone()

    num_days = days_row['days'] if days_row['days'] else 1
    daily_avg = total_spent / num_days

    finance = conn.execute(
        "SELECT * FROM finance WHERE user_id=? ORDER BY id DESC", (session['user_id'],)
    ).fetchone()

    labels = [cat['category'] for cat in categories]
    values = [cat['total'] for cat in categories]
    conn.close()

    return render_template(
        'analysis.html',
        total_spent=total_spent,
        categories=categories,
        daily_avg=daily_avg,
        needs=finance['needs'],
        labels=labels,
        values=values
    )

# -----------------------------
# LOGOUT
# -----------------------------
@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

# -----------------------------
# RUN
# -----------------------------
if __name__ == '__main__':
    app.run(debug=True)