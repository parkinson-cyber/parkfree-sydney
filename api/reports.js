// Crowd reports — the only thing on the map that says "right now".
//
// GET  /api/reports?lat=&lon=&radius=   -> { reports: [...], live: bool }
// POST /api/reports  { lat, lon, kind, deviceId, streetId?, streetName? }
//      kind: left | looks_empty  (a space is free — 15 min TTL)
//            parked | looks_full (taken — 30 min TTL)
//
// Reports are stored as reports and rendered as reports: `source: "user"`
// on every record, never merged into a street's rules. `live` tells the app
// whether shared storage is behind this instance (Upstash) or only the
// per-lambda memory fallback.

const { randomUUID } = require('crypto');
const { usingRedis, putReport, reportsNear, allowReport } = require('./_lib/store');

const KINDS = { left: 15 * 60, looks_empty: 15 * 60, parked: 30 * 60, looks_full: 30 * 60 };
const SYDNEY = { minLat: -34.2, maxLat: -33.5, minLon: 150.5, maxLon: 151.4 };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const lat = Number(req.query.lat), lon = Number(req.query.lon);
      const radius = Math.min(Number(req.query.radius) || 1500, 5000);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat_lon_required' });
      const reports = await reportsNear({ lat, lon, radius });
      return res.status(200).json({ reports, live: usingRedis });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const lat = Number(body.lat), lon = Number(body.lon);
      const kind = String(body.kind || '');
      const deviceId = String(body.deviceId || '').slice(0, 64);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat_lon_required' });
      if (!(kind in KINDS)) return res.status(400).json({ error: 'bad_kind' });
      if (!deviceId) return res.status(400).json({ error: 'device_id_required' });
      if (lat < SYDNEY.minLat || lat > SYDNEY.maxLat || lon < SYDNEY.minLon || lon > SYDNEY.maxLon) {
        return res.status(422).json({ error: 'outside_service_area' });
      }
      if (!(await allowReport(deviceId))) return res.status(429).json({ error: 'rate_limited' });
      const report = {
        id: `r_${randomUUID()}`,
        latitude: lat, longitude: lon, kind,
        streetId: Number.isFinite(Number(body.streetId)) ? Number(body.streetId) : null,
        streetName: body.streetName ? String(body.streetName).slice(0, 80) : null,
        source: 'user',
        reportedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + KINDS[kind] * 1000).toISOString(),
        reportedBy: deviceId,
      };
      await putReport(report, KINDS[kind]);
      return res.status(201).json({ report, live: usingRedis });
    }
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
};
