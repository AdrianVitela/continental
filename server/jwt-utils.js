'use strict';
const jwt  = require('jsonwebtoken');
const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'continental_secret_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function signUserToken(user) {
  return jwt.sign(
    { id: user.id, nombre: user.nombre, rol: user.rol, ver: user.token_version ?? 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function getTokenVersion(id) {
  const r = await pool.query('SELECT token_version FROM usuarios WHERE id = $1', [id]);
  return r.rows[0]?.token_version ?? null;
}

async function incrementTokenVersion(id) {
  await pool.query('UPDATE usuarios SET token_version = token_version + 1 WHERE id = $1', [id]);
}

async function verifyAuthorized(authHeader, { ignoreExpiration = false } = {}) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('No autorizado.');
    err.status = 401;
    throw err;
  }
  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), JWT_SECRET, { ignoreExpiration });
  } catch (e) {
    const err = new Error('Token inválido o expirado.');
    err.status = 401;
    throw err;
  }
  const ver = await getTokenVersion(payload.id);
  if (ver === null) {
    const err = new Error('Usuario no encontrado.');
    err.status = 404;
    throw err;
  }
  if (ver !== (payload.ver ?? 0)) {
    const err = new Error('Sesión revocada. Vuelve a iniciar sesión.');
    err.status = 401;
    throw err;
  }
  return payload;
}

module.exports = { signUserToken, verifyAuthorized, getTokenVersion, incrementTokenVersion, JWT_EXPIRES_IN, JWT_SECRET };
