'use strict';
const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const pool     = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'continental_secret_2026';

const NAME_RE  = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ ]{2,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/register ──────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    // Validaciones
    if (!nombre || !NAME_RE.test(nombre.trim()))
      return res.status(400).json({ error: 'Nombre inválido (2-18 letras/números).' });
    if (!email || !EMAIL_RE.test(email.trim()))
      return res.status(400).json({ error: 'Email inválido.' });
    if (!password || password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    if (!/[A-Z]/.test(password))
      return res.status(400).json({ error: 'La contraseña debe tener al menos una mayúscula.' });
    if (!/[!@#$%^&*()\-_=+\[\]{};':"\|,.<>/?`~]/.test(password))
      return res.status(400).json({ error: 'La contraseña debe tener al menos un carácter especial.' });

    const safeNombre = nombre.trim();
    const safeEmail  = email.trim().toLowerCase();

    // Verificar si ya existe
    const existe = await pool.query(
      'SELECT id FROM usuarios WHERE nombre = $1 OR email = $2',
      [safeNombre, safeEmail]
    );
    if (existe.rows.length > 0)
      return res.status(409).json({ error: 'El nombre de usuario o email ya está en uso.' });

    // Hashear contraseña
    const hash = await bcrypt.hash(password, 12);

    // Insertar usuario
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, email, password) VALUES ($1, $2, $3) RETURNING id, nombre, badge, rol',
      [safeNombre, safeEmail, hash]
    );
    const usuario = result.rows[0];

    // Generar token
    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, badge: usuario.badge, rol: usuario.rol } });

  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ── POST /api/login ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });

    const safeEmail = email.trim().toLowerCase();

    // Buscar usuario
    const result = await pool.query(
      'SELECT id, nombre, password, badge, rol FROM usuarios WHERE email = $1',
      [safeEmail]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });

    const usuario = result.rows[0];

    // Verificar contraseña
    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok)
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });

    // Generar token
    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, badge: usuario.badge, rol: usuario.rol } });

  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ── GET /api/me ─────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer '))
      return res.status(401).json({ error: 'No autorizado.' });

    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);

    const result = await pool.query(
      'SELECT id, nombre, badge, rol, created_at FROM usuarios WHERE id = $1',
      [payload.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Usuario no encontrado.' });

    res.json({ usuario: result.rows[0] });

  } catch (err) {
    res.status(401).json({ error: 'Token inválido o expirado.' });
  }
});

module.exports = router;