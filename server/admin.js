'use strict';
const express    = require('express');
const jwt        = require('jsonwebtoken');
const pool       = require('./db');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'continental_secret_2026';

const BADGES = {
  'owner':         { label: 'Owner',         emoji: '👑' },
  'beta_tester':   { label: 'Beta Tester',   emoji: '🧪' },
  'early_adopter': { label: 'Early Adopter', emoji: '🎖️' },
  'vip':           { label: 'VIP',           emoji: '⭐' },
};

// Middleware — solo owner
function requireOwner(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer '))
      return res.status(401).json({ error: 'No autorizado.' });
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    if (payload.rol !== 'owner')
      return res.status(403).json({ error: 'Acceso denegado.' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
}

// ── GET /api/admin/usuarios ─────────────────────────────────────
router.get('/admin/usuarios', requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, email, badge, rol, created_at FROM usuarios ORDER BY created_at DESC'
    );
    res.json({ usuarios: result.rows });
  } catch (err) {
    console.error('[admin]', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ── POST /api/admin/badge ───────────────────────────────────────
router.post('/admin/badge', requireOwner, async (req, res) => {
  try {
    const { usuarioId, badge } = req.body;
    if (!usuarioId) return res.status(400).json({ error: 'usuarioId requerido.' });

    // badge null = quitar badge
    if (badge !== null && badge !== undefined && !BADGES[badge])
      return res.status(400).json({ error: 'Badge inválido.' });

    await pool.query(
      'UPDATE usuarios SET badge = $1 WHERE id = $2',
      [badge || null, usuarioId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin badge]', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ── GET /api/admin/badges ───────────────────────────────────────
router.get('/admin/badges', requireOwner, async (req, res) => {
  res.json({ badges: BADGES });
});

module.exports = router;