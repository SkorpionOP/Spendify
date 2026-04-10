import sqlite3
conn = sqlite3.connect('database.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
cursor.execute("SELECT * FROM finance")
rows = cursor.fetchall()
for row in rows:
    print(dict(row))
conn.close()
