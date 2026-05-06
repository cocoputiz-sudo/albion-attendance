require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || 'senha123admin22';

const OFFICERS = {
  'RAGNALDOKHUN': process.env.OFFICER_RAGNALDOKHUN || 'ragna12senha12'
};

const PLAYERS = [
  'BADMACK','YODEAD','MITRIUS','RODRIGUINHOGG','AMENDOIM123','RAFAJHON',
  'PVPKABULOSO','STANZZAO','SHUVIZINHA','AKAMEAKT','LEFETE','GAME',
  'MILPICAS','NEGAUMBLACK','LILIFLOR','VXNXQ','LUCARE','KAMUSGOOD',
  'TARZAN05','ISAHEL','LASUERTE','HYPNOISBRO1','FLAGELO01','MOAHBIIZ'
];

const BUILDS = {
  'Arqueiro':  ['Capacete','Peito','Bota','Arco Plangente'],
  'Fire':      ['Capacete','Peito','Bota','Canção da Alvorada'],
  'Caller':    ['Capacete','Peito','Bota','Bruxo','Lume Críptico'],
  'Frost':     ['Capacete','Peito','Bota','Prisma'],
  'Piercers':  ['Capacete','Peito','Bota','Caça Espíritos','Execrado','Brumário'],
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

function isPrivileged(req) {
  const pass = req.headers['x-admin-pass'];
  const nick = (req.headers['x-officer-nick'] || '').toUpperCase();
  if (pass === ADMIN_PASS) return true;
  if (nick && OFFICERS[nick] && OFFICERS[nick] === pass) return true;
  return false;
}
function requireAdmin(req, res, next) {
  if (!isPrivileged(req)) return res.status(403).json({ error: 'Acesso negado.' });
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { type, nick, password } = req.body;
  if (type === 'admin') {
    if (password !== ADMIN_PASS) return res.status(401).json({ error: 'Senha incorreta.' });
    return res.json({ role: 'admin', nick: 'ADMIN' });
  }
  if (type === 'officer') {
    const upper = (nick || '').toUpperCase();
    if (!OFFICERS[upper] || OFFICERS[upper] !== password) return res.status(401).json({ error: 'Nick ou senha incorretos.' });
    return res.json({ role: 'admin', nick: upper, isOfficer: true });
  }
  if (type === 'player') {
    const upper = (nick || '').toUpperCase();
    if (!PLAYERS.includes(upper)) return res.status(401).json({ error: 'Nick não encontrado.' });
    return res.json({ role: 'player', nick: upper });
  }
  res.status(400).json({ error: 'Tipo inválido.' });
});

app.get('/api/players', (req, res) => res.json(PLAYERS));

// ── Members ───────────────────────────────────────────────────────────────────
app.get('/api/members', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM members ORDER BY active DESC, joined_at DESC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar membros.' }); }
});

app.post('/api/members', requireAdmin, async (req, res) => {
  const { nick, joined_at, notes } = req.body;
  if (!nick || !joined_at) return res.status(400).json({ error: 'Nick e data de entrada obrigatórios.' });
  try {
    const result = await pool.query(
      'INSERT INTO members (nick, joined_at, notes) VALUES ($1, $2, $3) ON CONFLICT (nick) DO UPDATE SET joined_at=$2, notes=$3, active=TRUE, left_at=NULL RETURNING *',
      [nick.toUpperCase(), joined_at, notes || null]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar membro.' }); }
});

app.patch('/api/members/:nick', requireAdmin, async (req, res) => {
  const { active, left_at, joined_at, notes } = req.body;
  try {
    const updates = [];
    const params = [];
    if (active !== undefined) { params.push(active); updates.push(`active = $${params.length}`); }
    if (left_at !== undefined) { params.push(left_at); updates.push(`left_at = $${params.length}`); }
    if (joined_at !== undefined) { params.push(joined_at); updates.push(`joined_at = $${params.length}`); }
    if (notes !== undefined) { params.push(notes); updates.push(`notes = $${params.length}`); }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.params.nick.toUpperCase());
    await pool.query(`UPDATE members SET ${updates.join(', ')} WHERE nick = $${params.length}`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar membro.' }); }
});

app.delete('/api/members/:nick', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM members WHERE nick = $1', [req.params.nick.toUpperCase()]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao deletar membro.' }); }
});

// ── Attendance ────────────────────────────────────────────────────────────────
app.get('/api/attendance', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date obrigatório' });
  try {
    const result = await pool.query('SELECT player, cta, status FROM attendance WHERE date = $1', [date]);
    const grouped = {};
    result.rows.forEach(r => {
      if (!grouped[r.cta]) grouped[r.cta] = { present: [], absent: [] };
      grouped[r.cta][r.status === 'present' ? 'present' : 'absent'].push(r.player);
    });
    res.json(grouped);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar attendance.' }); }
});

app.post('/api/attendance', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!priv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, status } = req.body;
  if (!date || !cta || !player || !status) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  if (!priv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode marcar sua própria presença.' });
  if (!['present','absent'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  if (!PLAYERS.includes(player.toUpperCase())) return res.status(400).json({ error: 'Player não encontrado.' });
  try {
    await pool.query(`INSERT INTO attendance (date, cta, player, status) VALUES ($1,$2,$3,$4)
      ON CONFLICT (date, cta, player) DO UPDATE SET status = EXCLUDED.status`,
      [date, cta, player.toUpperCase(), status]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar attendance.' }); }
});

// ── Kills ─────────────────────────────────────────────────────────────────────
app.get('/api/kills', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const { from, to } = req.query;
  try {
    let q = 'SELECT id, date::text as date, cta, player, kill_count, screenshot, created_at FROM kills WHERE 1=1';
    const p = [];
    if (!priv && nick) { p.push(nick.toUpperCase()); q += ` AND player = $${p.length}`; }
    if (from) { p.push(from); q += ` AND date >= $${p.length}`; }
    if (to)   { p.push(to);   q += ` AND date <= $${p.length}`; }
    q += ' ORDER BY created_at DESC LIMIT 200';
    const result = await pool.query(q, p);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar kills.' }); }
});

app.post('/api/kills', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!priv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, kill_count, screenshot } = req.body;
  if (!date || !cta || !player) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  if (!priv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode registrar seus próprios kills.' });
  try {
    const result = await pool.query(
      'INSERT INTO kills (date, cta, player, kill_count, screenshot) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [date, cta, player.toUpperCase(), kill_count || 0, screenshot || null]);
    res.json({ ok: true, id: result.rows[0].id });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar kill.' }); }
});

app.delete('/api/kills/:id', requireAdmin, async (req, res) => {
  try { await pool.query('DELETE FROM kills WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao deletar.' }); }
});

// ── Re-gear ───────────────────────────────────────────────────────────────────
app.get('/api/regear', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const { from, to } = req.query;
  try {
    let q = `SELECT id, date::text as date, cta, player, note, screenshot, status, paid,
             overcharge, overcharge_build, overcharge_parts, death_role, created_at FROM regear WHERE 1=1`;
    const p = [];
    if (!priv && nick) { p.push(nick.toUpperCase()); q += ` AND player = $${p.length}`; }
    if (from) { p.push(from); q += ` AND date >= $${p.length}`; }
    if (to)   { p.push(to);   q += ` AND date <= $${p.length}`; }
    q += ' ORDER BY created_at DESC';
    const result = await pool.query(q, p);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar regear.' }); }
});

app.post('/api/regear', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!priv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, note, screenshot, overcharge, overcharge_build, overcharge_parts, death_role } = req.body;
  if (!date || !cta || !player || !screenshot) return res.status(400).json({ error: 'Print da morte obrigatório.' });
  if (!priv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode pedir re-gear para si mesmo.' });
  try {
    const result = await pool.query(
      `INSERT INTO regear (date, cta, player, note, screenshot, overcharge, overcharge_build, overcharge_parts, death_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [date, cta, player.toUpperCase(), note || null, screenshot,
       overcharge || false, overcharge_build || null,
       JSON.stringify(overcharge_parts || []), death_role || null]);
    res.json({ ok: true, id: result.rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao salvar pedido.' }); }
});

app.patch('/api/regear/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending','approved','denied'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  try { await pool.query('UPDATE regear SET status = $1 WHERE id = $2', [status, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao atualizar status.' }); }
});

app.patch('/api/regear/:id/paid', requireAdmin, async (req, res) => {
  const { paid } = req.body;
  try { await pool.query('UPDATE regear SET paid = $1 WHERE id = $2', [!!paid, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao atualizar pagamento.' }); }
});

app.delete('/api/regear/:id', requireAdmin, async (req, res) => {
  try { await pool.query('DELETE FROM regear WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao deletar.' }); }
});

// ── Compras (shopping list) ───────────────────────────────────────────────────
app.get('/api/shopping', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  try {
    let q = `SELECT overcharge, overcharge_build, overcharge_parts, death_role
             FROM regear WHERE status = 'approved' AND paid = FALSE`;
    const p = [];
    if (from) { p.push(from); q += ` AND date >= $${p.length}`; }
    if (to)   { p.push(to);   q += ` AND date <= $${p.length}`; }
    const result = await pool.query(q, p);

    // Build shopping list
    const shopping = {};
    Object.keys(BUILDS).forEach(b => { shopping[b] = {}; BUILDS[b].forEach(part => { shopping[b][part] = 0; }); });

    result.rows.forEach(r => {
      // Death: full set
      if (r.death_role && shopping[r.death_role]) {
        BUILDS[r.death_role].forEach(part => { shopping[r.death_role][part]++; });
      }
      // Overcharge: individual parts
      if (r.overcharge && r.overcharge_build && shopping[r.overcharge_build]) {
        const parts = Array.isArray(r.overcharge_parts) ? r.overcharge_parts : JSON.parse(r.overcharge_parts || '[]');
        parts.forEach(part => {
          if (shopping[r.overcharge_build][part] !== undefined) shopping[r.overcharge_build][part]++;
        });
      }
    });

    // Remove builds with nothing to buy
    Object.keys(shopping).forEach(b => {
      if (Object.values(shopping[b]).every(v => v === 0)) delete shopping[b];
    });

    res.json(shopping);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao calcular compras.' }); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  try {
    const bw = (alias) => {
      const p = []; let w = 'WHERE 1=1';
      if (from) { p.push(from); w += ` AND ${alias}.date >= $${p.length}`; }
      if (to)   { p.push(to);   w += ` AND ${alias}.date <= $${p.length}`; }
      return { w, p };
    };
    const a = bw('a'), k = bw('k'), r = bw('r');
    const [attQ, killsQ, rgQ, ctasQ, rgByPlayerQ, killsByPlayerQ] = await Promise.all([
      pool.query(`SELECT player, status, COUNT(*)::int as cnt FROM attendance a ${a.w} GROUP BY player, status`, a.p),
      pool.query(`SELECT player, SUM(kill_count)::int as total FROM kills k ${k.w} GROUP BY player`, k.p),
      pool.query(`SELECT status, COUNT(*)::int as cnt FROM regear r ${r.w} GROUP BY status`, r.p),
      pool.query(`SELECT COUNT(DISTINCT (date::text || cta))::int as total FROM attendance a ${a.w}`, a.p),
      pool.query(`SELECT player, COUNT(*)::int as cnt FROM regear r ${r.w} GROUP BY player`, r.p),
      pool.query(`SELECT player, SUM(kill_count)::int as total FROM kills k ${k.w} GROUP BY player ORDER BY total DESC`, k.p),
    ]);
    res.json({
      attendance: attQ.rows, kills: killsQ.rows, killsByPlayer: killsByPlayerQ.rows,
      regear: rgQ.rows, regearByPlayer: rgByPlayerQ.rows, totalCTAs: ctasQ.rows[0]?.total || 0
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar stats.' }); }
});

// ── Clear all ─────────────────────────────────────────────────────────────────
app.delete('/api/data/all', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM attendance');
    await pool.query('DELETE FROM kills');
    await pool.query('DELETE FROM regear');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao limpar dados.' }); }
});

// ── Export CSV ────────────────────────────────────────────────────────────────
app.get('/api/export/csv', async (req, res) => {
  const pass = req.headers['x-admin-pass'] || req.query._admin;
  const nick = (req.headers['x-officer-nick'] || '').toUpperCase();
  const ok = pass === ADMIN_PASS || (nick && OFFICERS[nick] && OFFICERS[nick] === pass);
  if (!ok) return res.status(403).json({ error: 'Acesso negado.' });
  try {
    const att   = await pool.query('SELECT date, cta, player, status FROM attendance ORDER BY date, cta, player');
    const kills = await pool.query('SELECT date, cta, player, kill_count FROM kills ORDER BY date');
    let csv = 'Data,CTA,Player,Presença\n';
    att.rows.forEach(r => { csv += `${r.date},${r.cta},${r.player},${r.status === 'present' ? 'Presente' : 'Ausente'}\n`; });
    csv += '\nData,CTA,Player,Kills\n';
    kills.rows.forEach(r => { csv += `${r.date},${r.cta},${r.player},${r.kill_count}\n`; });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
    res.send('\uFEFF' + csv);
  } catch (e) { res.status(500).json({ error: 'Erro ao exportar.' }); }
});

// ── Fallback ──────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`[Server] Rodando na porta ${PORT}`));
}).catch(err => { console.error('[DB] Falha ao inicializar:', err); process.exit(1); });
