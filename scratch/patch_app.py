import os

path = r'c:\Users\user\Documents\Projects\Expense\app.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if '"SELECT * FROM finance WHERE user_id=?"' in line and 'session[' in line:
        new_lines.append(line.replace('"SELECT * FROM finance WHERE user_id=?"', '"SELECT * FROM finance WHERE user_id=? ORDER BY id DESC"'))
    else:
        new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Updates applied via script.")
