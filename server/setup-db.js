require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('./db');

console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ cargado' : '❌ no encontrado');

async function crearTablas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id          SERIAL PRIMARY KEY,
      nombre      VARCHAR(30)  NOT NULL UNIQUE,
      email       VARCHAR(100) NOT NULL UNIQUE,
      password    VARCHAR(255) NOT NULL,
      badge       VARCHAR(50)  DEFAULT NULL,
      rol         VARCHAR(20)  DEFAULT 'jugador',
      skin        VARCHAR(50)  DEFAULT 'clasico',
      chips       BIGINT       NOT NULL DEFAULT 10000,
      created_at  TIMESTAMP    DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id          SERIAL PRIMARY KEY,
      usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      nombre      VARCHAR(30),
      mensaje     TEXT NOT NULL,
      rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS skin VARCHAR(50) DEFAULT 'clasico'
  `);

  await pool.query(`
    UPDATE usuarios
    SET skin = 'clasico'
    WHERE skin IS NULL OR skin = ''
  `);

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS chips BIGINT NOT NULL DEFAULT 10000
  `);

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS last_reload_at TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partidas (
      id            SERIAL PRIMARY KEY,
      codigo        VARCHAR(5),
      con_apuesta   BOOLEAN DEFAULT FALSE,
      ronda         SMALLINT DEFAULT 7,
      created_at    TIMESTAMP DEFAULT NOW(),
      finished_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partidas_jugadores (
      id             SERIAL PRIMARY KEY,
      partida_id     INTEGER REFERENCES partidas(id) ON DELETE CASCADE,
      user_id        INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      nombre         VARCHAR(30),
      posicion       SMALLINT,
      pts_totales    INTEGER,
      fichas_inicio  BIGINT,
      fichas_final   BIGINT,
      ganancia       BIGINT
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pj_user    ON partidas_jugadores(user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pj_partida ON partidas_jugadores(partida_id)
  `);

  console.log('✅ Tablas creadas correctamente');
  await pool.end();
}

crearTablas().catch(err => {
  console.error('❌ Error creando tablas:', err.message);
  console.error(err);
  process.exit(1);
});