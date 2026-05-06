const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        cta VARCHAR(20) NOT NULL,
        player VARCHAR(50) NOT NULL,
        status VARCHAR(10) NOT NULL CHECK (status IN ('present', 'absent')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (date, cta, player)
      );

      CREATE TABLE IF NOT EXISTS kills (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        cta VARCHAR(20) NOT NULL,
        player VARCHAR(50) NOT NULL,
        kill_count INTEGER NOT NULL DEFAULT 0,
        screenshot TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS regear (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        cta VARCHAR(20) NOT NULL,
        player VARCHAR(50) NOT NULL,
        note TEXT,
        screenshot TEXT NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[DB] Tabelas criadas/verificadas com sucesso.');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
