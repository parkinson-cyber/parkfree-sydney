#!/usr/bin/env python3
"""Minimal dependency-free PDF text extractor (zlib + ascii85 only).
Handles: ASCII85Decode + FlateDecode streams, content-stream text operators
(Tj, TJ, ', "), and ToUnicode CMap mapping (bfchar / bfrange)."""
import sys, re, zlib, base64, binascii

path = sys.argv[1]
data = open(path, 'rb').read()

def ascii85_decode(b):
    # strip whitespace, handle <~ ~> delimiters if present
    b = b.strip()
    if b.startswith(b'<~'):
        b = b[2:]
    if b.endswith(b'~>'):
        b = b[:-2]
    try:
        return base64.a85decode(b, adobe=False)
    except Exception:
        # fallback: manual
        return base64.a85decode(re.sub(rb'\s', b'', b), adobe=False)

def try_decode_stream(raw, filters):
    out = raw
    for f in filters:
        if f == 'ASCII85Decode' or f == 'A85':
            out = ascii85_decode(out)
        elif f == 'FlateDecode' or f == 'Fl':
            try:
                out = zlib.decompress(out)
            except Exception as e:
                try:
                    out = zlib.decompressobj().decompress(out)
                except Exception:
                    raise
    return out

# Find all "obj ... stream ... endstream" blocks
obj_re = re.compile(rb'(\d+)\s+(\d+)\s+obj(.*?)endobj', re.DOTALL)
stream_re = re.compile(rb'stream\r?\n(.*?)\r?\nendstream', re.DOTALL)

streams = []  # (objnum, dict_bytes, decoded_or_None, kind)
for m in obj_re.finditer(data):
    objnum = int(m.group(1))
    body = m.group(3)
    sm = stream_re.search(body)
    header = body[:sm.start()] if sm else body
    filters = []
    if b'ASCII85Decode' in header: filters.append('ASCII85Decode')
    if b'FlateDecode' in header: filters.append('FlateDecode')
    decoded = None
    if sm:
        raw = sm.group(1)
        try:
            decoded = try_decode_stream(raw, filters) if filters else raw
        except Exception as e:
            decoded = None
    kind = 'other'
    if b'/Image' in header or b'/XObject' in header and b'/Image' in header:
        kind = 'image'
    if b'/ToUnicode' in header:
        kind = 'tounicode'
    streams.append((objnum, header, decoded, filters, sm is not None))

print("=== STREAM INVENTORY ===")
for objnum, header, decoded, filters, has in streams:
    hs = header.decode('latin-1', 'replace')
    subtype = ''
    for key in ['/Subtype', '/Type']:
        mm = re.search(re.escape(key)+r'\s*/(\w+)', hs)
        if mm: subtype += f"{key}={mm.group(1)} "
    dl = len(decoded) if decoded is not None else -1
    print(f"obj {objnum}: filters={filters} decoded_len={dl} {subtype.strip()}")

# Build ToUnicode maps from any stream containing beginbfchar/beginbfrange
def parse_tounicode(text):
    m = {}
    # bfchar
    for block in re.findall(r'beginbfchar(.*?)endbfchar', text, re.DOTALL):
        for src, dst in re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', block):
            code = int(src, 16)
            # dst may be multi UTF-16BE
            chars = ''.join(chr(int(dst[i:i+4],16)) for i in range(0, len(dst), 4))
            m[code] = chars
    for block in re.findall(r'beginbfrange(.*?)endbfrange', text, re.DOTALL):
        for lo, hi, dst in re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', block):
            lo_i, hi_i = int(lo,16), int(hi,16)
            base = int(dst[:4],16) if len(dst)>=4 else int(dst,16)
            for i, code in enumerate(range(lo_i, hi_i+1)):
                m[code] = chr(base+i)
    return m

tounicode_maps = []
for objnum, header, decoded, filters, has in streams:
    if decoded and (b'beginbfchar' in decoded or b'beginbfrange' in decoded):
        tm = parse_tounicode(decoded.decode('latin-1','replace'))
        if tm:
            tounicode_maps.append((objnum, tm))
print(f"\n=== ToUnicode maps found: {len(tounicode_maps)} ===")

# Extract text strings from content streams. A content stream is one that has BT/ET.
def extract_text_ops(content):
    """Return list of raw strings shown by Tj/TJ/'/\" operators."""
    results = []
    # Tj:  (string) Tj   or  <hex> Tj
    # TJ:  [ (str) num (str) ... ] TJ
    # Match string literals and hex strings within the stream, but only text ops.
    # Simpler: scan for ( ... ) Tj , [ ... ] TJ , < ... > Tj
    i = 0
    s = content
    # find all TJ arrays and Tj strings
    for m in re.finditer(r'\[([^\]]*)\]\s*TJ', s, re.DOTALL):
        arr = m.group(1)
        parts = re.findall(r'\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>', arr)
        results.append(('TJ', parts))
    for m in re.finditer(r'(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)\s*Tj', s):
        results.append(('Tj', [m.group(1)]))
    for m in re.finditer(r'(\((?:\\.|[^\\)])*\))\s*[\'\"]', s):
        results.append(('q', [m.group(1)]))
    return results

def decode_pdf_string(tok, cmap=None):
    if tok.startswith('<'):
        hexs = re.sub(r'\s','', tok[1:-1])
        if len(hexs)%2: hexs+='0'
        codes = [int(hexs[i:i+2],16) for i in range(0,len(hexs),2)]
        # try 2-byte if cmap keys look 2-byte
        if cmap and max(cmap.keys(), default=0) > 255:
            codes2 = [int(hexs[i:i+4],16) for i in range(0,len(hexs),4)] if len(hexs)%4==0 else codes
            if cmap:
                return ''.join(cmap.get(c, '') for c in codes2)
        if cmap:
            return ''.join(cmap.get(c, chr(c) if 32<=c<127 else '') for c in codes)
        return ''.join(chr(c) if 32<=c<127 else '' for c in codes)
    else:
        # literal string, unescape
        body = tok[1:-1]
        out = []
        i=0
        esc = {'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f','(':'(',')':')','\\':'\\'}
        while i < len(body):
            c = body[i]
            if c=='\\' and i+1<len(body):
                nx = body[i+1]
                if nx in esc:
                    out.append(esc[nx]); i+=2; continue
                if nx.isdigit():
                    oct_ = body[i+1:i+4]
                    mo = re.match(r'[0-7]{1,3}', oct_)
                    val = int(mo.group(0),8)
                    out.append(chr(val)); i+=1+len(mo.group(0)); continue
                out.append(nx); i+=2; continue
            out.append(c); i+=1
        raw = ''.join(out)
        if cmap:
            # map each byte
            return ''.join(cmap.get(ord(ch), ch) for ch in raw)
        return raw

# Try extraction with each ToUnicode map and also without.
all_text_variants = {}
combined_cmap = {}
for _, tm in tounicode_maps:
    combined_cmap.update(tm)

content_texts = []
for objnum, header, decoded, filters, has in streams:
    if not decoded: continue
    if b'BT' in decoded and (b'Tj' in decoded or b'TJ' in decoded):
        text_ops = extract_text_ops(decoded.decode('latin-1','replace'))
        lines = []
        for kind, parts in text_ops:
            seg = ''
            for p in parts:
                if p.startswith('(') or p.startswith('<'):
                    seg += decode_pdf_string(p, combined_cmap if combined_cmap else None)
            if seg.strip():
                lines.append(seg)
        if lines:
            content_texts.append((objnum, lines))

print(f"\n=== CONTENT STREAMS WITH TEXT: {len(content_texts)} ===")
outpath = sys.argv[2] if len(sys.argv)>2 else None
alllines = []
for objnum, lines in content_texts:
    alllines.append(f"----- obj {objnum} -----")
    alllines.extend(lines)
text_out = '\n'.join(alllines)
print(text_out[:8000])
if outpath:
    open(outpath,'w').write(text_out)
    print(f"\n[written {len(text_out)} chars to {outpath}]")
