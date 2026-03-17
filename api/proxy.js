export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// ── 設定 ──────────────────────────────────────────────
const DAILY_LIMIT = 5;
const AIRTABLE_BASE = 'apppc7ryATEru7zRc';
const USAGE_TABLE = 'Usage Tracking';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || req.socket?.remoteAddress
          || 'unknown';
  const identifier = `proradar:${ip}`;

  const today = new Date().toISOString().slice(0, 10);
  const atBase = `https://api.airtable.com/v0/${AIRTABLE_BASE}`;
  const atHeaders = {
    Authorization: `Bearer ${process.env.AIRTABLE_TOKEN_REGHUB}`,
    'Content-Type': 'application/json',
  };

  // 查今日使用次數
  let currentCount = 0;
  let existing = null;
  try {
    const filter = encodeURIComponent(`AND({email}="${identifier}",{date}="${today}")`);
    const searchRes = await fetch(
      `${atBase}/${encodeURIComponent(USAGE_TABLE)}?filterByFormula=${filter}`,
      { headers: atHeaders }
    );
    const searchData = await searchRes.json();
    existing = (searchData.records || [])[0] || null;
    currentCount = existing ? (existing.fields.count || 0) : 0;
  } catch (e) {
    // 如果 Usage Tracking table 不存在，跳過限額檢查
    console.error('Usage tracking error:', e.message);
  }

  if (currentCount >= DAILY_LIMIT) {
    return res.status(429).json({
      error: {
        message: `今日 ProRadar 合規偵測次數（${DAILY_LIMIT} 次）已用完，請明天再來！如需更多偵測，請聯繫 ZC 顧問團隊。`
      }
    });
  }

  // 呼叫 Anthropic API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY_PRORADAR,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();

  // 成功後寫回使用次數
  if (!data.error) {
    try {
      if (existing) {
        await fetch(`${atBase}/${encodeURIComponent(USAGE_TABLE)}/${existing.id}`, {
          method: 'PATCH',
          headers: atHeaders,
          body: JSON.stringify({ fields: { count: currentCount + 1 } }),
        });
      } else {
        await fetch(`${atBase}/${encodeURIComponent(USAGE_TABLE)}`, {
          method: 'POST',
          headers: atHeaders,
          body: JSON.stringify({
            records: [{ fields: { email: identifier, date: today, count: 1 } }]
          }),
        });
      }
    } catch (e) {
      console.error('Usage write error:', e.message);
    }

    return res.status(response.status).json({
      ...data,
      _quota: {
        used: currentCount + 1,
        limit: DAILY_LIMIT,
        remaining: DAILY_LIMIT - currentCount - 1,
      }
    });
  }

  return res.status(response.status).json(data);
}
