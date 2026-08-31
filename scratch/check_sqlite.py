import os
import sqlite3

for p in [r'C:\DEV\attCheck\server\data\attcheck.sqlite', r'C:\DEV\checkOn\attCheck_ref\server\data\attcheck.sqlite']:
    if os.path.exists(p):
        conn = sqlite3.connect(p)
        cur = conn.cursor()
        print('=== SQLite:', p, '===')
        tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        for table in tables:
            t = table[0]
            cnt = cur.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            print(f'  Table {t}: {cnt} rows')
            if 'att' in t.lower():
                try:
                    dates = cur.execute(f"SELECT DISTINCT service_date FROM {t} ORDER BY service_date").fetchall()
                    print(f'    Dates ({len(dates)}):', [d[0] for d in dates])
                except Exception as e:
                    print(f'    Error querying dates: {e}')
