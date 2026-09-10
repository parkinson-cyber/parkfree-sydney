#!/usr/bin/env python3
"""Ask ArcGIS Online what a council actually publishes about parking.

This exists because guessing hostnames produced four councils recorded as
"publishes nothing" when the truth was that my invented hostname did not
resolve. So: search the ArcGIS Online catalogue by owner/title, follow the
item to its real service URL, and report layers whose *name* looks regulatory
(parking, sign, kerb, restriction) together with a live feature count.

A hit here is a lead, not data. Nothing is written to the map by this script.

    python3 scripts/probe-councils.py                # every council below
    python3 scripts/probe-councils.py blacktown      # one
"""
import json, re, sys, time, urllib.parse, urllib.request

UA = {'User-Agent': 'ParkFreeSydney/1.0 (+https://github.com/parkinson-cyber/parkfree-sydney)'}

# Search terms, not hostnames. The catalogue resolves them to real orgs.
COUNCILS = {
    'canterbury-bankstown': 'Canterbury Bankstown',
    'blacktown': 'Blacktown City Council',
    'the-hills': 'The Hills Shire Council',
    'cumberland': 'Cumberland City Council',
    'bayside': 'Bayside Council NSW',
    'fairfield': 'Fairfield City Council',
    'liverpool': 'Liverpool City Council NSW',
    'georges-river': 'Georges River Council',
}

KEYS = ('parking', 'park', 'sign', 'kerb', 'curb', 'restriction', 'permit', 'meter', 'clearway', 'no stopping')
STRONG = ('parking', 'kerb', 'restriction', 'permit', 'meter', 'clearway')


def get(url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def search(term):
    """Unquoted: a phrase search for "Blacktown City Council" returns zero
    because their items are titled things like "BCC Road Network"."""
    q = urllib.parse.quote(f'{term} (type:"Feature Service" OR type:"Map Service")')
    url = ('https://www.arcgis.com/sharing/rest/search'
           f'?q={q}&num=100&f=json&sortField=numviews&sortOrder=desc')
    try:
        return get(url).get('results', [])
    except Exception as e:
        print(f'  search failed: {e}')
        return []


def org_roots(results):
    """The catalogue gives item URLs; the org's own service directory lists
    everything it publishes, including items never shared to a group. That
    directory is where Parramatta's parking layers were actually found."""
    roots = []
    for item in results:
        m = re.match(r'(https://services\d*\.arcgis\.com/[^/]+/arcgis/rest/services)/', item.get('url') or '')
        if m and m.group(1) not in roots:
            roots.append(m.group(1))
    return roots


def services_in(root):
    try:
        d = get(root + '?f=json', timeout=30)
    except Exception:
        return []
    return [(s.get('name', ''), f"{root}/{s.get('name','').split('/')[-1]}/{s.get('type','FeatureServer')}")
            for s in d.get('services', [])]


def layers_of(service_url):
    try:
        d = get(service_url + '?f=json', timeout=30)
    except Exception:
        return []
    out = []
    for lyr in (d.get('layers') or []) + (d.get('tables') or []):
        out.append((lyr.get('id'), lyr.get('name') or ''))
    return out


def count(service_url, layer_id):
    try:
        d = get(f'{service_url}/{layer_id}/query?where=1%3D1&returnCountOnly=true&f=json', timeout=30)
        return d.get('count')
    except Exception:
        return None


def probe(key, term):
    print(f'\n=== {key}  ({term})')
    hits, seen = [], set()
    results = search(term)
    candidates = [{'title': i.get('title', ''), 'url': i.get('url') or ''} for i in results]
    for root in org_roots(results):
        print(f'  org directory: {root}')
        for name, svc in services_in(root):
            candidates.append({'title': name, 'url': svc})
    for item in candidates:
        url = item.get('url') or ''
        if not url or url in seen:
            continue
        seen.add(url)
        title = item.get('title', '')
        if not any(k in (title + url).lower() for k in KEYS):
            # Still worth opening: the item title may be generic ("Assets")
            # while a layer inside it is the parking register.
            if not any(w in title.lower() for w in ('asset', 'road', 'traffic', 'transport')):
                continue
        for lid, name in layers_of(url):
            low = name.lower()
            if not any(k in low for k in KEYS):
                continue
            n = count(url, lid)
            strong = any(k in low for k in STRONG)
            hits.append({'title': title, 'url': f'{url}/{lid}', 'layer': name,
                         'features': n, 'strong': strong})
            print(f'  {"**" if strong else "  "} {name}  ({n} features)\n      {url}/{lid}')
        time.sleep(0.3)
    if not hits:
        print('  nothing parking-shaped in the ArcGIS Online catalogue')
    return hits


if __name__ == '__main__':
    which = sys.argv[1:] or list(COUNCILS)
    report = {k: probe(k, COUNCILS[k]) for k in which if k in COUNCILS}
    out = 'scripts/data/council-probe.json'
    json.dump(report, open(out, 'w'), indent=1)
    print(f'\nwrote {out}: ' + ', '.join(f'{k} {len(v)}' for k, v in report.items()))
