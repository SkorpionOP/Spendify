import sqlite3

conn = sqlite3.connect('database.db')
cursor = conn.cursor()

# Get users
cursor.execute("SELECT DISTINCT user_id FROM finance")
users = [row[0] for row in cursor.fetchall()]

for user_id in users:
    # Get all records for this user, sorted by ID desc
    cursor.execute("SELECT id FROM finance WHERE user_id=? ORDER BY id DESC", (user_id,))
    ids = [row[0] for row in cursor.fetchall()]
    
    if len(ids) > 1:
        # Keep only the latest one
        to_delete = ids[1:]
        cursor.execute(f"DELETE FROM finance WHERE id IN ({','.join(map(str, to_delete))})")
        print(f"Deleted {len(to_delete)} duplicate records for user_id {user_id}")

conn.commit()
conn.close()
print("Deduplication complete.")
