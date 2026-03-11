// api/airtable.js
// ZC RegHub Proxy — Airtable passthrough
// Supported bases:
//   歐洲全區 Europe:  apppc7ryATEru7zRc  (table: europe_mastersheet)
//   東協 ASEAN:       appR0nF1XT7Ba8VOX  (table: asean_mastersheet)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ALLOWED_BASES = [
    'apppc7ryATEru7zRc', // 歐洲全區 Europe — table: europe_mastersheet (tblJggKVvfvE2HNs2)
    'appR0nF1XT7Ba8VOX', // 東協 ASEAN       — table: asean_mastersheet  (tbldiwoyLlGZbSWiJ)
  ];

  // Path format: /api/airtable/BASE_ID/TABLE_ID
  const segments = (req.query.path || '').split('/').filter(Boolean);
  const baseId   = segments[0];
  const tableId  = segments[1];

  if (!baseId || !tableId) {
    return res.status(400).json({ error: 'Usage: /api/airtable/BASE_ID/TABLE_ID' });
  }
  if (!ALLOWED_BASES.includes(baseId)) {
    return res.status(403).json({ error: `Base ${baseId} not whitelisted` });
  }

  const { path: _p, ...fwd } = req.query;
  const qs  = new URLSearchParams(fwd).toString();
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}${qs ? '?' + qs : ''}`;

  try {
    const r    = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN_REGHUB}` },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
