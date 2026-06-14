from backend.database.connection import get_pool


class PostgresWrapper:
    def __init__(self, conn):
        self.conn = conn
        self.last_cursor = None

    def execute(self, query, params=None):
        query = query.replace("?", "%s")
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
        try:
            get_pool().putconn(self.conn)
        except Exception:
            pass


def get_db():
    from backend.database.connection import get_db_connection

    conn = get_db_connection()
    db = PostgresWrapper(conn)
    try:
        yield db
    finally:
        db.close()
