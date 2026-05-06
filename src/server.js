require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
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
  'Ranged': {
    'Arqueiro':  ['Capacete','Peito','Bota','Arco Plangente'],
    'Fire':      ['Capacete','Peito','Bota','Canção da Alvorada'],
    'Caller':    ['Capacete','Peito','Bota','Bruxo','Lume Críptico'],
    'Frost':     ['Capacete','Peito','Bota','Prisma'],
    'Piercers':  ['Capacete','Peito','Bota','Caça Espíritos','Execrado','Brumário'],
    'Cravadas':  ['Capacete','Peito','Bota','Cravadas'],
  },
  'Melee': {
    'Caller':       ['Capacete','Peito','Bota','Maça de 1 mão','Escudo'],
    'Bracers':      ['Capacete','Peito','Bota','Battle Bracers'],
    'Cravadas':     ['Capacete','Peito','Bota','Cravadas'],
    'Frost':        ['Capacete','Peito','Bota','Prisma'],
    'Quebra-reinos':['Capacete','Peito','Bota','Quebrareinos'],
    'Piercer':      ['Capacete','Peito','Bota','Caça Espíritos'],
    'Oculto':       ['Capacete','Peito','Bota','Oculto'],
  }
};
function getBuildParts(genre, build) {
  return (BUILDS[genre] && BUILDS[genre][build]) || [];
}

function hashPass(p) { return crypto.createHash('sha256').update(p + 'imortais_salt').digest('hex'); }

app.use(cors());
app.use(express.json({ limit: '20mb' }));
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
app.post('/api/auth/login', async (req, res) => {
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

    // Check if player has a password set
    try {
      const member = await pool.query('SELECT password_hash FROM members WHERE nick = $1', [upper]);
      if (member.rows.length > 0 && member.rows[0].password_hash) {
        // Has password — validate
        if (!password) return res.status(401).json({ error: 'Este player requer senha.', needsPassword: true });
        if (member.rows[0].password_hash !== hashPass(password)) {
          return res.status(401).json({ error: 'Senha incorreta.', needsPassword: true });
        }
      } else {
        // No password set — first access, need to define
        if (!password) return res.status(401).json({ error: 'Primeiro acesso: defina sua senha.', firstAccess: true });
        // Save the new password
        await pool.query(
          'INSERT INTO members (nick, joined_at, password_hash) VALUES ($1, CURRENT_DATE, $2) ON CONFLICT (nick) DO UPDATE SET password_hash = $2',
          [upper, hashPass(password)]
        );
      }
    } catch (e) {
      console.error('Auth error:', e);
      return res.status(500).json({ error: 'Erro de autenticação.' });
    }

    return res.json({ role: 'player', nick: upper });
  }
  res.status(400).json({ error: 'Tipo inválido.' });
});

// Admin reset player password
app.post('/api/auth/reset-password', requireAdmin, async (req, res) => {
  const { nick, password } = req.body;
  if (!nick || !password) return res.status(400).json({ error: 'Nick e senha obrigatórios.' });
  try {
    await pool.query(
      'UPDATE members SET password_hash = $1 WHERE nick = $2',
      [hashPass(password), nick.toUpperCase()]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao resetar senha.' }); }
});

app.get('/api/players', (req, res) => res.json(PLAYERS));

// ── Members ───────────────────────────────────────────────────────────────────
app.get('/api/members', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nick, joined_at, left_at, active, notes, (password_hash IS NOT NULL) as has_password, created_at FROM members ORDER BY active DESC, joined_at DESC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar membros.' }); }
});

app.post('/api/members', requireAdmin, async (req, res) => {
  const { nick, joined_at, notes } = req.body;
  if (!nick || !joined_at) return res.status(400).json({ error: 'Nick e data obrigatórios.' });
  try {
    const result = await pool.query(
      'INSERT INTO members (nick, joined_at, notes) VALUES ($1, $2, $3) ON CONFLICT (nick) DO UPDATE SET joined_at=$2, notes=$3, active=TRUE, left_at=NULL RETURNING id, nick, joined_at, left_at, active, notes',
      [nick.toUpperCase(), joined_at, notes || null]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar membro.' }); }
});

app.patch('/api/members/:nick', requireAdmin, async (req, res) => {
  const { active, left_at, joined_at, notes } = req.body;
  try {
    const updates = [], params = [];
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
  try { await pool.query('DELETE FROM members WHERE nick = $1', [req.params.nick.toUpperCase()]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao deletar.' }); }
});

// ── Attendance ────────────────────────────────────────────────────────────────
app.get('/api/attendance', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date obrigatório' });
  try {
    const [att, shots] = await Promise.all([
      pool.query('SELECT player, cta, status FROM attendance WHERE date = $1', [date]),
      pool.query('SELECT player, cta, screenshot FROM attendance_screenshots WHERE date = $1', [date])
    ]);
    const grouped = {};
    att.rows.forEach(r => {
      if (!grouped[r.cta]) grouped[r.cta] = { present: [], absent: [], screenshots: [] };
      grouped[r.cta][r.status === 'present' ? 'present' : 'absent'].push(r.player);
    });
    shots.rows.forEach(r => {
      if (!grouped[r.cta]) grouped[r.cta] = { present: [], absent: [], screenshots: [] };
      grouped[r.cta].screenshots.push({ player: r.player, screenshot: r.screenshot });
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
  if (!date || !cta || !player || !status) return res.status(400).json({ error: 'Campos obrigatórios.' });
  if (!priv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode marcar sua própria presença.' });
  if (!['present','absent'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  if (!PLAYERS.includes(player.toUpperCase())) return res.status(400).json({ error: 'Player não encontrado.' });
  try {
    await pool.query(`INSERT INTO attendance (date, cta, player, status) VALUES ($1,$2,$3,$4) ON CONFLICT (date, cta, player) DO UPDATE SET status = EXCLUDED.status`,
      [date, cta, player.toUpperCase(), status]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar attendance.' }); }
});

// Upload screenshot for attendance
app.post('/api/attendance/screenshot', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!priv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, screenshot } = req.body;
  if (!date || !cta || !player || !screenshot) return res.status(400).json({ error: 'Campos obrigatórios.' });
  if (!priv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Não autorizado.' });
  try {
    await pool.query(
      `INSERT INTO attendance_screenshots (date, cta, player, screenshot) VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [date, cta, player.toUpperCase(), screenshot]
    );
    res.json({ ok: true });
  } catch (e) {
    // If conflict constraint missing, just insert
    try {
      await pool.query('INSERT INTO attendance_screenshots (date, cta, player, screenshot) VALUES ($1,$2,$3,$4)',
        [date, cta, player.toUpperCase(), screenshot]);
      res.json({ ok: true });
    } catch(e2) { res.status(500).json({ error: 'Erro ao salvar screenshot.' }); }
  }
});

// ── Kills ─────────────────────────────────────────────────────────────────────
app.get('/api/kills', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const { from, to } = req.query;
  try {
    let q = 'SELECT id, date::text as date, cta, player, kill_count, screenshot, screenshots, created_at FROM kills WHERE 1=1';
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
  const { date, cta, player, kill_count, screenshot, screenshots } = req.body;
  if (!date || !cta || !player) return res.status(400).json({ error: 'Campos obrigatórios.' });
  if (!priv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode registrar seus próprios kills.' });
  try {
    const allScreenshots = [];
    if (screenshot) allScreenshots.push(screenshot);
    if (screenshots && Array.isArray(screenshots)) allScreenshots.push(...screenshots);
    const result = await pool.query(
      'INSERT INTO kills (date, cta, player, kill_count, screenshot, screenshots) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [date, cta, player.toUpperCase(), kill_count || 0, allScreenshots[0] || null, JSON.stringify(allScreenshots)]);
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
             overcharge, overcharge_build, overcharge_genre, overcharge_parts, death_role, death_genre, created_at FROM regear WHERE 1=1`;
    const p = [];
    if (!priv && nick) { p.push(nick.toUpperCase()); q += ` AND player = $${p.length}`; }
    if (from) { p.push(from); q += ` AND date >= $${p.length}`; }
    if (to)   { p.push(to);   q += ` AND date <= $${p.length}`; }
    q += ' ORDER BY paid ASC, created_at DESC';
    const result = await pool.query(q, p);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar regear.' }); }
});

app.post('/api/regear', async (req, res) => {
  const nick = req.headers['x-player-nick'];
  const priv = isPrivileged(req);
  const isPlayer = nick && PLAYERS.includes(nick.toUpperCase());
  if (!priv && !isPlayer) return res.status(403).json({ error: 'Não autorizado.' });
  const { date, cta, player, note, screenshot, overcharge, overcharge_build, overcharge_genre, overcharge_parts, death_role, death_genre } = req.body;
  if (!date || !cta || !player || !screenshot) return res.status(400).json({ error: 'Print da morte obrigatório.' });
  if (!priv && player.toUpperCase() !== nick.toUpperCase()) return res.status(403).json({ error: 'Você só pode pedir re-gear para si mesmo.' });
  try {
    const result = await pool.query(
      `INSERT INTO regear (date, cta, player, note, screenshot, overcharge, overcharge_build, overcharge_genre, overcharge_parts, death_role, death_genre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [date, cta, player.toUpperCase(), note || null, screenshot,
       overcharge || false, overcharge_build || null, overcharge_genre || null,
       JSON.stringify(overcharge_parts || []), death_role || null, death_genre || null]);
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
  try {
    await pool.query('UPDATE regear SET paid = $1 WHERE id = $2', [!!paid, req.params.id]);
    // Auto-notify player when marked as paid
    if (paid) {
      const rg = await pool.query('SELECT player, cta, date::text as date, death_role, overcharge_build FROM regear WHERE id = $1', [req.params.id]);
      if (rg.rows.length) {
        const r = rg.rows[0];
        const item = r.death_role || r.overcharge_build || 'Re-gear';
        const author = (req.headers['x-officer-nick'] || 'ADMIN').toUpperCase();
        await pool.query(
          `INSERT INTO news (title, body, author, target_nick, auto_type)
           VALUES ($1, $2, $3, $4, 'regear_paid')`,
          [
            '✅ Seu re-gear está pronto!',
            `Seu re-gear de **${item}** da CTA ${r.cta} (${r.date}) foi aprovado e está disponível para retirada. Procure o officer responsável.`,
            author,
            r.player
          ]
        );
      }
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar pagamento.' }); }
});

app.delete('/api/regear/:id', requireAdmin, async (req, res) => {
  try { await pool.query('DELETE FROM regear WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Erro ao deletar.' }); }
});

// ── Shopping ──────────────────────────────────────────────────────────────────
app.get('/api/shopping', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  try {
    let q = `SELECT overcharge, overcharge_build, overcharge_parts, death_role FROM regear WHERE status = 'approved' AND paid = FALSE`;
    const p = [];
    if (from) { p.push(from); q += ` AND date >= $${p.length}`; }
    if (to)   { p.push(to);   q += ` AND date <= $${p.length}`; }
    const result = await pool.query(q, p);
    const shopping = {};
    result.rows.forEach(r => {
      // Death: full set — use genre+build key
      if (r.death_role) {
        const genre = r.death_genre || 'Ranged';
        const key = `${genre}::${r.death_role}`;
        const parts = getBuildParts(genre, r.death_role);
        if (parts.length) {
          if (!shopping[key]) shopping[key] = {};
          parts.forEach(p => { shopping[key][p] = (shopping[key][p] || 0) + 1; });
        }
      }
      // Overcharge: individual parts
      if (r.overcharge && r.overcharge_build) {
        const genre = r.overcharge_genre || 'Ranged';
        const key = `${genre}::${r.overcharge_build}`;
        const validParts = getBuildParts(genre, r.overcharge_build);
        if (validParts.length) {
          if (!shopping[key]) shopping[key] = {};
          const parts = Array.isArray(r.overcharge_parts) ? r.overcharge_parts : JSON.parse(r.overcharge_parts || '[]');
          parts.forEach(p => { if (validParts.includes(p)) shopping[key][p] = (shopping[key][p] || 0) + 1; });
        }
      }
    });
    // Remove empty keys
    Object.keys(shopping).forEach(k => { if (Object.values(shopping[k]).every(v => v === 0)) delete shopping[k]; });
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

// ── Clear / Export ────────────────────────────────────────────────────────────
app.delete('/api/data/all', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM attendance');
    await pool.query('DELETE FROM attendance_screenshots');
    await pool.query('DELETE FROM kills');
    await pool.query('DELETE FROM regear');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao limpar dados.' }); }
});

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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

initDB().then(() => {
  app.listen(PORT, () => console.log(`[Server] Rodando na porta ${PORT}`));
}).catch(err => { console.error('[DB] Falha:', err); process.exit(1); });
