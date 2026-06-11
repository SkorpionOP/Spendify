import os
from psycopg2 import pool as pg_pool
from psycopg2.extras import DictCursor
from dotenv import load_dotenv

load_dotenv()

_pool = None

def get_pool():
    global _pool
    if _pool is None:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            raise ValueError("DATABASE_URL environment variable is not set")
        _pool = pg_pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=db_url,
            cursor_factory=DictCursor
        )
    return _pool

def get_db_connection():
    pool = get_pool()
    conn = pool.getconn()
    return conn

def release_db_connection(conn):
    try:
        get_pool().putconn(conn)
    except Exception:
        pass
