import os

user_dirs = [
    r'C:\Users\rokmc\Downloads',
    r'C:\Users\rokmc\Desktop',
    r'C:\Users\rokmc\Documents'
]

for udir in user_dirs:
    if os.path.exists(udir):
        print('=== Searching:', udir, '===')
        for root, dirs, files in os.walk(udir):
            for f in files:
                if f.endswith(('.xlsx', '.xls', '.csv')):
                    if '~$' not in f:
                        print(os.path.join(root, f))
