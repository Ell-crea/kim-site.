// Fonction serverless (Vercel) : pont entre Typebot / dashboard et Snowflake (SQL API, auth par clé RSA)
const crypto = require('crypto');
const E = process.env;
const ACCT = (E.SNOWFLAKE_ACCOUNT || '').toUpperCase().split('.')[0];
const HOST = `${(E.SNOWFLAKE_ACCOUNT || '').toLowerCase().replace(/_/g, '-')}.snowflakecomputing.com`;
const USER = (E.SNOWFLAKE_USER || '').toUpperCase();

function token() {
  const key = (E.SNOWFLAKE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const pub = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
  const fp = 'SHA256:' + crypto.createHash('sha256').update(pub).digest('base64');
  const qual = `${ACCT}.${USER}`, now = Math.floor(Date.now() / 1000);
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: `${qual}.${fp}`, sub: qual, iat: now, exp: now + 3000 });
  return data + '.' + crypto.sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
}

async function sql(statement, binds = []) {
  const bindings = {};
  binds.forEach((v, i) => { bindings[i + 1] = { type: 'TEXT', value: String(v ?? '') }; });
  const r = await fetch(`https://${HOST}/api/v2/statements`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token(), 'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
               'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'kim-bot/1.0' },
    body: JSON.stringify({ statement, timeout: 30, database: 'KIM_DB', schema: 'CENTRE', warehouse: 'KIM_WH',
                           role: E.SNOWFLAKE_ROLE || undefined, bindings })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'Snowflake ' + r.status);
  const cols = (j.resultSetMetaData?.rowType || []).map(c => c.name.toLowerCase());
  return (j.data || []).map(row => Object.fromEntries(row.map((v, i) => [cols[i], v])));
}

const cut = (v, n = 500) => String(v ?? '').slice(0, n);
const KINDS = ['room', 'reg', 'part', 'help'], STATUS = ['wait', 'ok', 'ko', 'help'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-api-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const key = req.headers['x-api-key'];

    if (req.method === 'POST') {                       // envoyé par Typebot (bloc HTTP request)
      if (!E.WEBHOOK_KEY || key !== E.WEBHOOK_KEY) return res.status(401).json({ error: 'unauthorized' });
      if (!KINDS.includes(body.kind)) return res.status(400).json({ error: 'kind invalide' });
      await sql(`INSERT INTO REQUESTS (KIND,NAME,EMAIL,ACTIVITY,REQ_DATE,REQ_HOUR,DETAILS,LANG) VALUES (?,?,?,?,?,?,?,?)`,
        [body.kind, cut(body.name, 120), cut(body.email, 120), cut(body.activity, 120),
         cut(body.date, 40), cut(body.hour, 40), cut(body.details), cut(body.lang, 10)]);
      return res.status(201).json({ ok: true });
    }

    if (!E.ADMIN_KEY || key !== E.ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });

    if (req.method === 'GET') {                        // dashboard admin
      const reqs = await sql(`SELECT ID,KIND,STATUS,NAME,EMAIL,ACTIVITY,REQ_DATE,REQ_HOUR,DETAILS,LANG,
                              TO_VARCHAR(CREATED_AT,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
                              FROM REQUESTS ORDER BY REQUESTS.CREATED_AT DESC LIMIT 200`);
      const acts = (await sql(`SELECT NAME,DESCRIPTION,ICON,CAPACITY,TAKEN FROM ACTIVITIES`))
        .map(a => ({ n: a.name, d: a.description, ic: a.icon, cap: +a.capacity, pris: +a.taken }));
      return res.status(200).json({ requests: reqs, activities: acts });
    }

    if (req.method === 'PATCH') {                      // Valider / Refuser / Contacter
      if (!STATUS.includes(body.status) || !body.id) return res.status(400).json({ error: 'paramètres invalides' });
      await sql(`UPDATE REQUESTS SET STATUS=?, KIND=IFF(?='help','help',KIND) WHERE ID=?`, [body.status, body.status, body.id]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'méthode non supportée' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
