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

      CREATE TABLE IF NOT EXISTS attendance_screenshots (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        cta VARCHAR(20) NOT NULL,
        player VARCHAR(50) NOT NULL,
        screenshot TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS kills (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        cta VARCHAR(20) NOT NULL,
        player VARCHAR(50) NOT NULL,
        kill_count INTEGER NOT NULL DEFAULT 0,
        screenshot TEXT,
        screenshots JSONB DEFAULT '[]',
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
        overcharge_genre VARCHAR(20),
        overcharge_parts JSONB DEFAULT '[]',
        death_role VARCHAR(50),
        death_genre VARCHAR(20),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        nick VARCHAR(50) NOT NULL UNIQUE,
        joined_at DATE NOT NULL,
        left_at DATE,
        active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        password_hash VARCHAR(200),
        phone VARCHAR(30),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        body TEXT,
        image TEXT,
        author VARCHAR(50) NOT NULL,
        target_nick VARCHAR(50),
        auto_type VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS news_read (
        id SERIAL PRIMARY KEY,
        news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
        nick VARCHAR(50) NOT NULL,
        read_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(news_id, nick)
      );

      CREATE TABLE IF NOT EXISTS builds (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        genre VARCHAR(20) NOT NULL,
        image TEXT,
        parts TEXT,
        author VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        youtube_url VARCHAR(500) NOT NULL,
        author VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS overcharge BOOLEAN DEFAULT FALSE;
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS overcharge_build VARCHAR(50);
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS overcharge_genre VARCHAR(20);
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS overcharge_parts JSONB DEFAULT '[]';
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS death_role VARCHAR(50);
      ALTER TABLE regear ADD COLUMN IF NOT EXISTS death_genre VARCHAR(20);
      ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash VARCHAR(200);
      ALTER TABLE members ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
      ALTER TABLE kills ADD COLUMN IF NOT EXISTS screenshots JSONB DEFAULT '[]';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS highlights (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        type VARCHAR(10) NOT NULL CHECK (type IN ('upload','youtube')),
        url TEXT NOT NULL,
        author VARCHAR(50) NOT NULL,
        seen_by JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

        console.log('[DB] Tabelas criadas/verificadas com sucesso.');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
