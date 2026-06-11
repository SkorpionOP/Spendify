def init_tables():
    from backend.database.connection import get_db_connection
    from backend.models.db_wrapper import PostgresWrapper
    try:
        conn = get_db_connection()
        db = PostgresWrapper(conn)
        db.execute('''
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                message TEXT,
                date TEXT
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                password TEXT,
                uid TEXT UNIQUE,
                name TEXT,
                profile_pic TEXT
            )
        ''')
        db.execute('''
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
        db.execute('''
            CREATE TABLE IF NOT EXISTS monthly_budget (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                month TEXT,
                needs REAL,
                savings REAL
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                amount REAL,
                category TEXT,
                note TEXT DEFAULT '',
                date TEXT
            )
        ''')
        db.commit()
    except Exception as e:
        print("Database initialization error:", e)
    finally:
        if 'db' in locals():
            try:
                db.close()
            except Exception:
                pass
