#!/usr/bin/env python3
import re
raw = open('/Users/abc/Desktop/parkfree-sydney/scripts/data/_recovery/pdf-meter-rates-demand-areas.txt').read()
blocks = re.split(r'----- obj (\d+) -----', raw)
objs = {}
for i in range(1, len(blocks), 2):
    num = blocks[i]; content = blocks[i+1]
    joined = ''.join(line for line in content.split('\n'))
    objs[num] = joined
full = '\n'.join(f'== obj {k} ==\n{v}' for k,v in objs.items())
open('/Users/abc/Desktop/parkfree-sydney/scripts/data/_recovery/pdf-meter-rates-collapsed.txt','w').write(full)
print("objects with text:", [(k,len(v)) for k,v in objs.items()])
combined = ' '.join(objs.values())
up = combined.upper()
keywords = ['DEMAND','HIGH','MEDIUM','LOW','FRINGE','SHOULDER','CBD','RATE','$','GST','HOUR','8:30','6PM','6:00','MIDNIGHT','DAYTIME','EVENING','PERMIT','ZONE','1P','2P','3P','4P','15P','30P','TICKET','TARIFF','MAXIMUM','ALFRED']
print("\n=== KEYWORD HITS ===")
for kw in keywords:
    idx = up.find(kw.upper()); cnt = up.count(kw.upper())
    if idx >= 0:
        ctx = combined[max(0,idx-70):idx+90].replace('\n',' ')
        print(f"[{kw}] count={cnt} first@{idx}: ...{ctx}...")
    else:
        print(f"[{kw}] count=0 NOT FOUND")
print("\n=== DOLLAR / DECIMAL PATTERNS ===")
found=False
for m in re.finditer(r'\$?\d+\.\d{2}', combined):
    found=True; s=max(0,m.start()-45); print("  ", repr(combined[s:m.end()+12]))
if not found: print("  (none)")
print("\n=== time-limit tokens (Nd P) ===")
found=False
for m in re.finditer(r'\d{1,3}\s?P\b', combined):
    found=True; s=max(0,m.start()-35); print("  ", repr(combined[s:m.end()+18]))
if not found: print("  (none)")
