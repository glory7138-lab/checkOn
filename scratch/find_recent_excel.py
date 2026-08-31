import os
import glob
import datetime

paths_to_check = [
    r'C:\Users\rokmc\Downloads',
    r'C:\Users\rokmc\Desktop',
    r'C:\Users\rokmc\Documents',
    r'C:\DEV'
]

results = []
for p in paths_to_check:
    if os.path.exists(p):
        for root, dirs, files in os.walk(p):
            for f in files:
                if f.endswith(('.xlsx', '.xls', '.xlsm')) and not f.startswith('~$'):
                    full_p = os.path.join(root, f)
                    try:
                        mtime = os.path.getmtime(full_p)
                        dt = datetime.datetime.fromtimestamp(mtime)
                        size = os.path.getsize(full_p)
                        results.append((dt, size, full_p))
                    except:
                        pass

results.sort(key=lambda x: x[0], reverse=True)
print(f'Found {len(results)} Excel files. Top 30 most recently modified:')
for dt, size, full_p in results[:30]:
    print(f'[{dt.strftime("%Y-%m-%d %H:%M")}] ({size:>8} bytes) {full_p}')
