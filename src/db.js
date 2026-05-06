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
        paid BOOLEAN DEFAULT FALSE,
        overcharge BOOLEAN DEFAULT FALSE,
        overcharge_build VARCHAR(50),
        overcharge_parts JSONB DEFAULT '[]',
        death_role VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        nick VARCHAR(50) NOT NULL UNIQUE,
        joined_at DATE NOT NULL,
        left_at DATE,
        active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS overcharge BOOLEAN DEFAULT FALSE;
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS overcharge_build VARCHAR(50);
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS overcharge_parts JSONB DEFAULT '[]';
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS death_role VARCHAR(50);
    `);

    console.log('[DB] Tabelas criadas/verificadas com sucesso.');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
