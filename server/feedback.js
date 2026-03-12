'use strict';
const express      = require('express');
const nodemailer   = require('nodemailer');
const pool         = require('./db');
const jwt          = require('jsonwebtoken');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'continental_secret_2026';

// Configurar transporter de Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Middleware para obtener usuario del token (opcional)
function getUsuario(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch { return null; }
}

// ── POST /api/feedback ──────────────────────────────────────────
router.post('/feedback', async (req, res) => {
  try {
    const { mensaje, rating } = req.body;
    const usuario = getUsuario(req);

    if (!mensaje || mensaje.trim().length < 5)
      return res.status(400).json({ error: 'El mensaje es muy corto.' });
    if (rating && (rating < 1 || rating > 5))
      return res.status(400).json({ error: 'Rating inválido.' });

    const safeMensaje = mensaje.trim().slice(0, 1000);
    const safeRating  = rating ? Number(rating) : null;
    const nombre      = usuario?.nombre || 'Anónimo';

    // Guardar en DB
    await pool.query(
      'INSERT INTO feedback (usuario_id, nombre, mensaje, rating) VALUES ($1, $2, $3, $4)',
      [usuario?.id || null, nombre, safeMensaje, safeRating]
    );

    // Estrellas para el email
    const estrellas = safeRating ? '⭐'.repeat(safeRating) + ` (${safeRating}/5)` : 'Sin calificación';

    // Enviar email
    await transporter.sendMail({
      from: `"Continental Feedback" <${process.env.GMAIL_USER}>`,
      to:   process.env.FEEDBACK_TO,
      subject: `💬 Nuevo feedback de ${nombre}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0b1e12;color:#e8d5a3;padding:28px;border-radius:12px">
          <h2 style="color:#c8a045;margin-top:0">💬 Nuevo Feedback — Continental</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:6px 0;color:#aaa;width:120px">Usuario</td>
              <td style="padding:6px 0;font-weight:600">${nombre}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#aaa">Calificación</td>
              <td style="padding:6px 0">${estrellas}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#aaa;vertical-align:top">Mensaje</td>
              <td style="padding:6px 0">${safeMensaje.replace(/\n/g, '<br>')}</td>
            </tr>
          </table>
          <hr style="border-color:#1a3d28;margin:20px 0">
          <p style="color:#555;font-size:12px;margin:0">Continental Beta · ${new Date().toLocaleString('es-MX')}</p>
        </div>
      `,
    });

    res.json({ ok: true });

  } catch (err) {
    console.error('[feedback]', err.message);
    res.status(500).json({ error: 'Error al enviar feedback.' });
  }
});

module.exports = router;