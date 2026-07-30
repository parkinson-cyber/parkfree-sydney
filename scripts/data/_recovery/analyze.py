#!/usr/bin/env python3
import json, re
from collections import Counter, defaultdict

with open('osm-raw.json') as f:
    data = json.load(f)
els = data['elements']

def tags(e): return e.get('tags', {})

# --- classify elements ---
streets = []        # highway ways (road centrelines) -> where on-street parking lives
parking_lots = []   # amenity=parking (off-street car parks / parking_space)
meters = []         # amenity=parking_meter
vending = []        # vending=parking_tickets
moorings = []       # seamark / mooring noise carrying maxstay
other = []

for e in els:
    t = tags(e)
    if t.get('amenity') == 'parking_meter':
        meters.append(e)
    elif t.get('vending') == 'parking_tickets':
        vending.append(e)
    elif t.get('amenity') in ('parking',) or t.get('amenity')=='parking_space' or 'parking_space' in t:
        parking_lots.append(e)
    elif 'highway' in t:
        streets.append(e)
    elif any(k.startswith('seamark') for k in t) or t.get('mooring') or 'seamark:mooring:category' in t:
        moorings.append(e)
    else:
        other.append(e)

print("Element classification:")
print(f"  streets (highway ways):      {len(streets)}")
print(f"  off-street parking lots:     {len(parking_lots)}")
print(f"  parking_meter nodes:         {len(meters)}")
print(f"  vending=parking_tickets:     {len(vending)}")
print(f"  mooring/seamark (noise):     {len(moorings)}")
print(f"  other:                       {len(other)}")

# --- key predicates ---
def has_maxstay(t):
    for k in t:
        if k == 'maxstay' or k.startswith('maxstay:') \
           or re.match(r'^parking:(both|left|right):maxstay', k) \
           or re.match(r'^parking:lane:(both|left|right):maxstay', k) \
           or re.match(r'^parking:condition:(both|left|right):maxstay', k):
            return True
    return False

def has_fee(t):
    for k in t:
        if k == 'fee' or k == 'fee:conditional' \
           or re.match(r'^parking:(both|left|right):fee', k) \
           or re.match(r'^parking:fee', k) \
           or re.match(r'^parking:condition:(both|left|right):fee', k):
            return True
    return False

RESIDENT_VALS = ('residents','permit','private','customers','disc')
def permit_info(t):
    """Return list of (key,val) that indicate a permit/resident/restriction rule."""
    hits=[]
    for k,v in t.items():
        # new scheme restriction
        if re.match(r'^parking:(both|left|right):restriction', k):
            hits.append((k,v))
        # authentication (permit machines / apps / tickets)
        elif re.match(r'^parking:(both|left|right):authentication', k):
            hits.append((k,v))
        # old scheme condition value = residents/ticket/disc etc.
        elif re.match(r'^parking:condition:(both|left|right)$', k):
            hits.append((k,v))
        # access-based residents/permit
        elif k in ('access','motor_vehicle','parking:access','parking:left:access','parking:right:access','parking:both:access') and v in RESIDENT_VALS:
            hits.append((k,v))
    return hits

def is_permit_restriction(t):
    """Streets whose restriction/condition specifically denotes residents/permit parking."""
    for k,v in t.items():
        if re.match(r'^parking:(both|left|right):restriction$', k) and v in ('residents','permit'):
            return True
        if re.match(r'^parking:(both|left|right):restriction:conditional$', k) and re.search(r'residents|permit', v):
            return True
        if re.match(r'^parking:condition:(both|left|right)$', k) and re.search(r'residents|permit', v):
            return True
        if re.match(r'^parking:(both|left|right):authentication', k):
            return True
        if k in ('access','motor_vehicle') and v in ('residents','permit'):
            return True
        if re.match(r'^parking:(both|left|right):access$', k) and v in ('residents','permit'):
            return True
    return False

# --- counts over streets ---
def name_of(e): return tags(e).get('name') or tags(e).get('ref') or f"(unnamed {e['type']}/{e['id']})"

streets_maxstay = [e for e in streets if has_maxstay(tags(e))]
streets_fee     = [e for e in streets if has_fee(tags(e))]
streets_permit  = [e for e in streets if is_permit_restriction(tags(e))]

# distinct street names
def distinct_names(lst):
    return sorted(set(tags(e).get('name','(unnamed)') for e in lst))

print("\n=== STREET-LEVEL (on-street) PARKING RULE COUNTS ===")
print(f"street ways with a MAXSTAY (time-limit / P):  {len(streets_maxstay)} ways, "
      f"{len(distinct_names(streets_maxstay))} distinct street names")
print(f"street ways with a FEE/price:                 {len(streets_fee)} ways, "
      f"{len(distinct_names(streets_fee))} distinct street names")
print(f"street ways with PERMIT/resident restriction: {len(streets_permit)} ways, "
      f"{len(distinct_names(streets_permit))} distinct street names")

# also: any parking restriction at all (no_parking/no_stopping/etc)
def has_any_restriction(t):
    for k in t:
        if re.match(r'^parking:(both|left|right):restriction', k): return True
        if re.match(r'^parking:condition:(both|left|right)$', k): return True
    return False
streets_anyrestr = [e for e in streets if has_any_restriction(tags(e))]
print(f"street ways with ANY parking:restriction/condition: {len(streets_anyrestr)} ways, "
      f"{len(distinct_names(streets_anyrestr))} distinct names")

# streets that carry ANY parking tag namespace
def has_any_parking(t):
    return any(k=='parking' or k.startswith('parking:') for k in t)
streets_anyparking = [e for e in streets if has_any_parking(tags(e))]
print(f"street ways with ANY parking:* tag:            {len(streets_anyparking)} ways, "
      f"{len(distinct_names(streets_anyparking))} distinct names")

# --- samples ---
def sample(lst, keyfilter, n=12):
    out=[]
    for e in lst[:n]:
        t=tags(e)
        rel={k:v for k,v in t.items() if keyfilter(k)}
        out.append({"name": name_of(e), "id": f"{e['type']}/{e['id']}", "tags": rel})
    return out

print("\n=== SAMPLE: maxstay streets ===")
for s in sample(streets_maxstay, lambda k: 'maxstay' in k):
    print(f"  {s['name']:35s} {s['id']:12s} {s['tags']}")

print("\n=== SAMPLE: fee streets ===")
for s in sample(streets_fee, lambda k: 'fee' in k):
    print(f"  {s['name']:35s} {s['id']:12s} {s['tags']}")

print("\n=== SAMPLE: permit/resident streets ===")
for s in sample(streets_permit, lambda k: 'restriction' in k or 'condition' in k or 'authentication' in k or k in ('access','motor_vehicle') or ':access' in k):
    print(f"  {s['name']:35s} {s['id']:12s} {s['tags']}")

# distribution of restriction values on streets
print("\n=== restriction/condition VALUE distribution (streets) ===")
valc=Counter()
for e in streets:
    for k,v in tags(e).items():
        if re.match(r'^parking:(both|left|right):restriction$', k) or re.match(r'^parking:condition:(both|left|right)$', k):
            valc[v]+=1
for v,c in valc.most_common():
    print(f"  {c:3d}  {v}")

# meters / vending detail
print("\n=== parking_meter nodes ===", len(meters))
for e in meters[:20]:
    t=tags(e)
    print(f"  node/{e['id']} fee={t.get('fee')} maxstay={t.get('maxstay')} operator={t.get('operator')}")
print("=== vending=parking_tickets nodes ===", len(vending))
for e in vending[:20]:
    t=tags(e)
    print(f"  {e['type']}/{e['id']} fee={t.get('fee')} operator={t.get('operator')} payment_coins={t.get('payment:coins')}")

# mooring noise names (to confirm exclusion)
print("\n=== mooring/seamark elements excluded (carry maxstay but not roads) ===", len(moorings))
mm=Counter(tags(e).get('maxstay') for e in moorings)
print("  their maxstay values:", dict(mm))

# save a compact structured summary + samples json
summary = {
  "source": "OpenStreetMap via Overpass API",
  "endpoint_used": open('osm-endpoint-used.txt').read().strip(),
  "bbox_S_W_N_E": [-33.86,151.18,-33.79,151.245],
  "query_date": "2026-07-30",
  "raw_element_counts": {
     "total_elements": len(els),
     "streets_highway_ways": len(streets),
     "off_street_parking_lots": len(parking_lots),
     "parking_meter_nodes": len(meters),
     "vending_parking_tickets_nodes": len(vending),
     "mooring_seamark_noise_excluded": len(moorings),
     "other": len(other),
  },
  "on_street_rule_counts": {
     "maxstay_time_limit": {"ways": len(streets_maxstay), "distinct_street_names": len(distinct_names(streets_maxstay))},
     "fee_price":          {"ways": len(streets_fee),     "distinct_street_names": len(distinct_names(streets_fee))},
     "permit_resident_restriction": {"ways": len(streets_permit), "distinct_street_names": len(distinct_names(streets_permit))},
     "any_parking_restriction_or_condition": {"ways": len(streets_anyrestr), "distinct_street_names": len(distinct_names(streets_anyrestr))},
     "any_parking_namespace_tag": {"ways": len(streets_anyparking), "distinct_street_names": len(distinct_names(streets_anyparking))},
  },
  "distinct_street_names": {
     "maxstay": distinct_names(streets_maxstay),
     "fee": distinct_names(streets_fee),
     "permit": distinct_names(streets_permit),
  },
  "restriction_value_distribution": dict(valc),
  "samples": {
     "maxstay": sample(streets_maxstay, lambda k: 'maxstay' in k, 40),
     "fee": sample(streets_fee, lambda k: 'fee' in k, 40),
     "permit": sample(streets_permit, lambda k: 'restriction' in k or 'condition' in k or 'authentication' in k or k in ('access','motor_vehicle') or ':access' in k, 40),
  },
  "meters": [{"id": f"node/{e['id']}", "tags": tags(e)} for e in meters],
  "vending_parking_tickets": [{"id": f"{e['type']}/{e['id']}", "tags": tags(e)} for e in vending],
}
with open('osm-northsydney.json','w') as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)
print("\nWROTE osm-northsydney.json")
PY_DONE = True
