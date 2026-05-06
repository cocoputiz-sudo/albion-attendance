require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || 'senha123admin22';

// Officers: nick -> senha (adicione mais aqui ou via variáveis de ambiente)
const OFFICERS = {
  'RAGNALDOKHUN': process.env.OFFICER_RAGNALDOKHUN || 'ragna12senha12'
};

const PLAYERS = [
  'BADMACK','YODEAD','MITRIUS','RODRIGUINHOGG','AMENDOIM123','RAFAJHON',
  'PVPKABULOSO','STANZZAO','SHUVIZINHA','AKAMEAKT','LEFETE','GAME',
  'MILPICAS','NEGAUMBLACK','LILIFLOR','VXNXQ','LUCARE','KAMUSGOOD',
  'TARZAN05','ISAHEL','LASUERTE','HYPNOISBRO1','FLAGELO01','MOAHBIIZ'
];

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

function isAdminOrOfficer(req) {
  const pass = req.headers['x-admin-pass'];
  const nick = (req.headers['x-officer-nick'] || '').toUpperCase();
  if (pass === ADMIN_PASS) return true;
  if (nick && OFFICERS[nick] && OFFICERS[nick] === pass) return true;
  return false;
}

function requireAdmin(req, res, next) {
  if (!isAdminOrOfficer(req)) return res.status(403).json({ error: 'Acesso negado.' });
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
app.get('/api/officers', requireAdmin, (req, res) => res.json(Object.keys(OFFICERS)));

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
  const isPriv = isAdminOrOfficer(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!isPriv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, status } = req.body;
  if (!date || !cta || !player || !status) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  if (!isPriv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode marcar sua própria presença.' });
  if (!['present','absent'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  if (!PLAYERS.includes(player.toUpperCase())) return res.status(400).json({ error: 'Player não encontrado.' });
  try {
    await pool.query(`INSERT INTO attendance (date, cta, player, status) VALUES ($1,$2,$3,$4) ON CONFLICT (date, cta, player) DO UPDATE SET status = EXCLUDED.status`,
      [date, cta, player.toUpperCase(), status]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar attendance.' }); }
});

// ── Kills ─────────────────────────────────────────────────────────────────────
app.get('/api/kills', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const isPriv = isAdminOrOfficer(req);
  const { from, to } = req.query;
  try {
    let query = 'SELECT id, date::text as date, cta, player, kill_count, screenshot, created_at FROM kills WHERE 1=1';
    const params = [];
    if (!isPriv && nick) { params.push(nick.toUpperCase()); query += ` AND player = $${params.length}`; }
    if (from) { params.push(from); query += ` AND date >= $${params.length}`; }
    if (to)   { params.push(to);   query += ` AND date <= $${params.length}`; }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar kills.' }); }
});

app.post('/api/kills', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const isPriv = isAdminOrOfficer(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!isPriv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, kill_count, screenshot } = req.body;
  if (!date || !cta || !player) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  if (!isPriv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode registrar seus próprios kills.' });
  try {
    const result = await pool.query('INSERT INTO kills (date, cta, player, kill_count, screenshot) VALUES ($1,$2,$3,$4,$5) RETURNING id',
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
  const isPriv = isAdminOrOfficer(req);
  const { from, to } = req.query;
  try {
    let query = 'SELECT id, date::text as date, cta, player, note, screenshot, status, created_at FROM regear WHERE 1=1';
    const params = [];
    if (!isPriv && nick) { params.push(nick.toUpperCase()); query += ` AND player = $${params.length}`; }
    if (from) { params.push(from); query += ` AND date >= $${params.length}`; }
    if (to)   { params.push(to);   query += ` AND date <= $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar regear.' }); }
});

app.post('/api/regear', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const isPriv = isAdminOrOfficer(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!isPriv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, note, screenshot } = req.body;
  if (!date || !cta || !player || !screenshot) return res.status(400).json({ error: 'Print da morte obrigatório.' });
  if (!isPriv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode pedir re-gear para si mesmo.' });
  try {
    const result = await pool.query('INSERT INTO regear (date, cta, player, note, screenshot) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [date, cta, player.toUpperCase(), note || null, screenshot]);
    res.json({ ok: true, id: result.rows[0].id });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar pedido.' }); }
});

app.patch('/api/regear/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending','approved','denied'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  try { await pool.query('UPDATE regear SET status = $1 WHERE id = $2', [status, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao atualizar status.' }); }
});

app.delete('/api/regear/:id', requireAdmin, async (req, res) => {
  try { await pool.query('DELETE FROM regear WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao deletar.' }); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  try {
    // Build date filter safely
    let attWhere = 'WHERE 1=1', killWhere = 'WHERE 1=1', rgWhere = 'WHERE 1=1';
    const attP = [], killP = [], rgP = [];

    if (from) { attP.push(from);  attWhere  += ` AND date >= $${attP.length}`;  }
    if (to)   { attP.push(to);    attWhere  += ` AND date <= $${attP.length}`;  }
    if (from) { killP.push(from); killWhere += ` AND date >= $${killP.length}`; }
    if (to)   { killP.push(to);   killWhere += ` AND date <= $${killP.length}`; }
    if (from) { rgP.push(from);   rgWhere   += ` AND date >= $${rgP.length}`;   }
    if (to)   { rgP.push(to);     rgWhere   += ` AND date <= $${rgP.length}`;   }

    const [attQ, killsQ, rgQ, ctasQ, rgByPlayerQ] = await Promise.all([
      pool.query(`SELECT player, status, COUNT(*)::int as cnt FROM attendance ${attWhere} GROUP BY player, status`, attP),
      pool.query(`SELECT player, SUM(kill_count)::int as total FROM kills ${killWhere} GROUP BY player`, killP),
      pool.query(`SELECT status, COUNT(*)::int as cnt FROM regear ${rgWhere} GROUP BY status`, rgP),
      pool.query(`SELECT COUNT(DISTINCT (date::text || cta))::int as total FROM attendance ${attWhere}`, attP),
      pool.query(`SELECT player, COUNT(*)::int as cnt FROM regear ${rgWhere} GROUP BY player`, rgP),
    ]);

    res.json({
      attendance: attQ.rows,
      kills: killsQ.rows,
      regear: rgQ.rows,
      regearByPlayer: rgByPlayerQ.rows,
      totalCTAs: ctasQ.rows[0]?.total || 0
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

// ── Fallback SPA ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`[Server] Rodando na porta ${PORT}`));
}).catch(err => {
  console.error('[DB] Falha ao inicializar:', err);
  process.exit(1);
});
