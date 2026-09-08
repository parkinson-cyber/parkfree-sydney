// Crowd-report storage. Upstash Redis over REST when the Vercel Marketplace
// integration has injected UPSTASH_REDIS_REST_URL/TOKEN; otherwise a
// per-instance in-memory map so the API still works before storage is
// provisioned (reports then live only as long as that lambda instance).
//
// Redis layout:  reports:geo  GEO set (member = id)
//                report:<id>  JSON with TTL
//                reports:exp  ZSET score = expiry epoch (lazy purge of geo)

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const usingRedis = Boolean(REST_URL && REST_TOKEN);

async function pipeline(commands) {
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
  const out = await res.json();
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Upstash: ${failed.error}`);
  return out.map((r) => r.result);
}

const memory = new Map(); // id -> { report, expiresAt }
const rate = new Map();   // deviceId -> { count, resetAt }

function metres(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function putReport(report, ttlSeconds) {
  if (!usingRedis) {
    memory.set(report.id, { report, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  await pipeline([
    ['GEOADD', 'reports:geo', String(report.longitude), String(report.latitude), report.id],
    ['SET', `report:${report.id}`, JSON.stringify(report), 'EX', String(ttlSeconds)],
    ['ZADD', 'reports:exp', String(expiresAt), report.id],
  ]);
}

async function reportsNear({ lat, lon, radius = 1500, limit = 300 }) {
  if (!usingRedis) {
    const now = Date.now();
    for (const [id, e] of memory) if (e.expiresAt <= now) memory.delete(id);
    return [...memory.values()]
      .map(({ report }) => ({ report, d: metres({ lat, lon }, { lat: report.latitude, lon: report.longitude }) }))
      .filter(({ d }) => d <= radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map(({ report }) => report);
  }
  const now = Math.floor(Date.now() / 1000);
  const [stale] = await pipeline([['ZRANGEBYSCORE', 'reports:exp', '-inf', String(now)]]);
  if (stale && stale.length) await pipeline([['ZREM', 'reports:exp', ...stale], ['ZREM', 'reports:geo', ...stale]]);
  const [ids] = await pipeline([[
    'GEOSEARCH', 'reports:geo', 'FROMLONLAT', String(lon), String(lat),
    'BYRADIUS', String(radius), 'm', 'ASC', 'COUNT', String(limit),
  ]]);
  if (!ids || !ids.length) return [];
  const [raw] = await pipeline([['MGET', ...ids.map((id) => `report:${id}`)]]);
  return (raw || []).filter(Boolean).map((j) => (typeof j === 'string' ? JSON.parse(j) : j));
}

// 30 reports per device per hour — enough for anyone, not enough to paint the map.
async function allowReport(deviceId) {
  const WINDOW = 3600, MAX = 30;
  if (!usingRedis) {
    const now = Date.now();
    const e = rate.get(deviceId);
    if (!e || e.resetAt <= now) { rate.set(deviceId, { count: 1, resetAt: now + WINDOW * 1000 }); return true; }
    e.count += 1;
    return e.count <= MAX;
  }
  try {
    const [n] = await pipeline([['INCR', `rate:${deviceId}`], ['EXPIRE', `rate:${deviceId}`, String(WINDOW), 'NX']]);
    return Number(n) <= MAX;
  } catch {
    return true; // a limiter outage must not block reporting
  }
}

module.exports = { usingRedis, putReport, reportsNear, allowReport };
