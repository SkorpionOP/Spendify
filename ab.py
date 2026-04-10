

def change_db():
    import sqlite3

    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS monthly_budget (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        month TEXT,
        needs REAL,
        savings REAL
    )
    ''')
if __name__ == "__main__":
    change_db()
