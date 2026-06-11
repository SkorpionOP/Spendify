import os
from dotenv import load_dotenv
import psycopg2

load_dotenv()

db_url = os.environ.get("DATABASE_URL")
print("DATABASE_URL:", db_url)

if not db_url:
    print("DATABASE_URL not set")
    exit(1)

# Append sslmode=require if it's a supabase postgres connection and missing sslmode
if ("supabase.co" in db_url or "supabase" in db_url) and "sslmode" not in db_url:
    sep = "&" if "?" in db_url else "?"
    db_url = f"{db_url}{sep}sslmode=require"

try:
    print("Connecting to database...")
    conn = psycopg2.connect(db_url)
    print("Connected successfully!")
    cur = conn.cursor()
    cur.execute("SELECT version();")
    db_version = cur.fetchone()
    print("Database version:", db_version)
    cur.close()
    conn.close()
except Exception as e:
    print("Error connecting to database:", e)
