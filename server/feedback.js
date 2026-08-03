'use strict';
const express    = require('express');
const { Resend } = require('resend');
const pool       = require('./db');

const router     = express.Router();
const resend     = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const { middleware: rateLimit } = require('./rate-limit');
const { verifyAuthorized } = require('./jwt-utils');

async function getUsuario(req) {
  try {
    return await verifyAuthorized(req.headers.authorization);
  } catch { return null; }
}

router.post('/feedback', rateLimit({ max: 10, windowMs: 15 * 60 * 1000, message: 'Demasiados envíos de feedback. Espera unos minutos.' }), async (req, res) => {
  try {
    const { mensaje, rating } = req.body;
    const usuario = await getUsuario(req);

    if (!mensaje || mensaje.trim().length < 5)
      return res.status(400).json({ error: 'El mensaje es muy corto.' });
    if (rating && (rating < 1 || rating > 5))
      return res.status(400).json({ error: 'Rating inválido.' });

    const safeMensaje = mensaje.trim().slice(0, 1000);
    const safeRating  = rating ? Number(rating) : null;
    const nombre      = usuario?.nombre || 'Anónimo';

    await pool.query(
      'INSERT INTO feedback (usuario_id, nombre, mensaje, rating) VALUES ($1, $2, $3, $4)',
      [usuario?.id || null, nombre, safeMensaje, safeRating]
    );

    const estrellas = safeRating ? '⭐'.repeat(safeRating) + ` (${safeRating}/5)` : 'Sin calificación';

    if (!resend) {
      console.log('[feedback] sin RESEND_API_KEY: feedback guardado solo en BD');
      return res.json({ ok: true });
    }

    const resendResult = await resend.emails.send({
      from: 'Continental <onboarding@resend.dev>',
      to:   process.env.FEEDBACK_TO,
      subject: `💬 Nuevo feedback de ${nombre}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0b1e12;color:#e8d5a3;padding:28px;border-radius:12px">
          <h2 style="color:#c8a045;margin-top:0">💬 Nuevo Feedback — Continental</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#aaa;width:120px">Usuario</td><td style="padding:6px 0;font-weight:600">${nombre}</td></tr>
            <tr><td style="padding:6px 0;color:#aaa">Calificación</td><td style="padding:6px 0">${estrellas}</td></tr>
            <tr><td style="padding:6px 0;color:#aaa;vertical-align:top">Mensaje</td><td style="padding:6px 0">${safeMensaje.replace(/\n/g, '<br>')}</td></tr>
          </table>
          <hr style="border-color:#1a3d28;margin:20px 0">
          <p style="color:#555;font-size:12px;margin:0">Continental Beta · ${new Date().toLocaleString('es-MX')}</p>
        </div>
      `,
    });

    console.log('[feedback] Resend result:', JSON.stringify(resendResult));
    if (resendResult.error) {
      console.error('[feedback] Resend error:', resendResult.error);
      return res.status(500).json({ error: 'Error al enviar email.' });
    }
    res.json({ ok: true });

  } catch (err) {
    console.error('[feedback]', err.message);
    res.status(500).json({ error: 'Error al enviar feedback.' });
  }
});

module.exports = router;