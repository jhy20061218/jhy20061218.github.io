// =========================================================
// 留言箱后端 —— Cloudflare Worker + D1
//
// 公开接口
//   GET  /api/messages?before=<id>     已审核的留言（每页 20 条）
//   POST /api/messages                 新留言 {name, content, token}，进入待审核
// 管理接口（请求头 Authorization: Bearer <ADMIN_TOKEN>）
//   GET    /api/admin/messages?status=pending|approved
//   POST   /api/admin/messages/:id     {approved?: 0|1, reply?: string|null}
//   DELETE /api/admin/messages/:id
// =========================================================

const LIMITS = { name: 20, content: 500, reply: 500 };
const PAGE_SIZE = 20;
const RATE = { windowMs: 10 * 60 * 1000, max: 3 };   // 每个 IP 10 分钟内最多 3 条
const PENDING_CAP = 300;                               // 待审核队列上限，防止被灌满
const MAX_BODY = 4096;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404, cors);

    try {
      if (url.pathname === '/api/messages') {
        if (req.method === 'GET') return listPublic(url, env, cors);
        if (req.method === 'POST') return createMessage(req, env, cors);
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401, cors);
        if (url.pathname === '/api/admin/messages' && req.method === 'GET') return listAdmin(url, env, cors);
        const m = url.pathname.match(/^\/api\/admin\/messages\/(\d{1,12})$/);
        if (m && req.method === 'POST') return updateMessage(req, Number(m[1]), env, cors);
        if (m && req.method === 'DELETE') return deleteMessage(Number(m[1]), env, cors);
      }
      return json({ error: 'not_found' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'server_error' }, 500, cors);
    }
  },
};

// ---------- 公开：读取 ----------
async function listPublic(url, env, cors) {
  const before = toInt(url.searchParams.get('before'));
  const stmt = before
    ? env.DB.prepare('SELECT id, name, content, reply, created_at FROM messages WHERE approved = 1 AND id < ? ORDER BY id DESC LIMIT ?').bind(before, PAGE_SIZE + 1)
    : env.DB.prepare('SELECT id, name, content, reply, created_at FROM messages WHERE approved = 1 ORDER BY id DESC LIMIT ?').bind(PAGE_SIZE + 1);
  const { results } = await stmt.all();
  const more = results.length > PAGE_SIZE;
  return json({ messages: results.slice(0, PAGE_SIZE), more }, 200, { ...cors, 'Cache-Control': 'public, max-age=30' });
}

// ---------- 公开：写留言 ----------
async function createMessage(req, env, cors) {
  if (!allowedOrigin(req, env)) return json({ error: 'forbidden' }, 403, cors);
  const body = await readJson(req);
  if (!body) return json({ error: 'bad_request' }, 400, cors);

  const name = clean(body.name, false) || '匿名';
  const content = clean(body.content, true);
  if (!content) return json({ error: 'empty' }, 400, cors);
  if (len(name) > LIMITS.name || len(content) > LIMITS.content) return json({ error: 'too_long' }, 400, cors);

  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!(await verifyTurnstile(body.token, ip, env))) return json({ error: 'captcha' }, 403, cors);

  const ipHash = await sha256(`${env.IP_SALT || ''}|${ip}`);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - RATE.windowMs).first('n');
  if (recent >= RATE.max) return json({ error: 'rate_limited' }, 429, cors);

  const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE approved = 0').first('n');
  if (pending >= PENDING_CAP) return json({ error: 'busy' }, 503, cors);

  await env.DB.prepare('INSERT INTO messages (name, content, ip_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(name, content, ipHash, now).run();
  return json({ ok: true }, 201, cors);
}

// ---------- 管理 ----------
async function listAdmin(url, env, cors) {
  const approved = url.searchParams.get('status') === 'approved' ? 1 : 0;
  const { results } = await env.DB.prepare('SELECT id, name, content, reply, approved, created_at FROM messages WHERE approved = ? ORDER BY id DESC LIMIT 200')
    .bind(approved).all();
  return json({ messages: results }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function updateMessage(req, id, env, cors) {
  const body = await readJson(req);
  if (!body) return json({ error: 'bad_request' }, 400, cors);
  const sets = [], args = [];
  if (body.approved === 0 || body.approved === 1) { sets.push('approved = ?'); args.push(body.approved); }
  if ('reply' in body) {
    const reply = body.reply == null ? null : clean(body.reply, true) || null;
    if (reply && len(reply) > LIMITS.reply) return json({ error: 'too_long' }, 400, cors);
    sets.push('reply = ?'); args.push(reply);
  }
  if (!sets.length) return json({ error: 'bad_request' }, 400, cors);
  const r = await env.DB.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  return json({ ok: r.meta.changes > 0 }, r.meta.changes ? 200 : 404, cors);
}

async function deleteMessage(id, env, cors) {
  const r = await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
  return json({ ok: r.meta.changes > 0 }, r.meta.changes ? 200 : 404, cors);
}

// ---------- 安全相关 ----------
function origins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}
function allowedOrigin(req, env) {
  const o = req.headers.get('Origin');
  return !!o && origins(env).includes(o);
}
function corsHeaders(req, env) {
  const h = {
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  if (allowedOrigin(req, env)) {
    h['Access-Control-Allow-Origin'] = req.headers.get('Origin');
    h['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

async function isAdmin(req, env) {
  const expected = env.ADMIN_TOKEN || '';
  if (expected.length < 12) return false;              // 没设置或太短，一律拒绝
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  // 比较哈希，避免按字节提前退出带来的计时差异
  const [a, b] = await Promise.all([sha256(got), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyTurnstile(token, ip, env) {
  if (typeof token !== 'string' || !token || token.length > 2048 || !env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await r.json().catch(() => ({}));
  return data.success === true;
}

// ---------- 工具 ----------
async function readJson(req) {
  if (!(req.headers.get('Content-Type') || '').includes('application/json')) return null;
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

// 去掉控制字符和首尾空白；多行文本保留换行，但最多连续两个空行
function clean(v, multiline) {
  if (typeof v !== 'string') return '';
  let s = v.normalize('NFC').replace(/\r\n?/g, '\n');
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g
                          : /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '');
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
const len = (s) => [...s].length;
const toInt = (v) => (/^\d{1,12}$/.test(v || '') ? Number(v) : 0);

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
