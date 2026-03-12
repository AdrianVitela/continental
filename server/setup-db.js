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

  console.log('✅ Tablas creadas correctamente');
  await pool.end();
}

crearTablas().catch(err => {
  console.error('❌ Error creando tablas:', err.message);
  console.error(err);
  process.exit(1);
});