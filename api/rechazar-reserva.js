const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await verificarAdmin(req.headers.authorization);

    const { reservaId, motivoRechazo } = req.body;
    if (!reservaId) return res.status(400).json({ error: 'Falta reservaId.' });

    const supabaseAdmin = obtenerClienteAdmin();

    const { data: reservaActualizada, error } = await supabaseAdmin
      .from('reservas')
      .update({ estado: 'rechazada', motivo_rechazo: motivoRechazo || null })
      .eq('id', reservaId)
      .select('*, profiles(nombre_completo, correo)')
      .single();

    if (error) throw error;

    try {
      if (process.env.RESEND_API_KEY && reservaActualizada.profiles) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_REMITENTE || 'estudio@unimagdalena.edu.co',
          to: reservaActualizada.profiles.correo,
          subject: 'Reserva rechazada - Estudio de Grabación',
          html: `<p>Hola ${reservaActualizada.profiles.nombre_completo},</p>
                 <p>Tu reserva del <strong>${reservaActualizada.fecha}</strong> de <strong>${reservaActualizada.hora_inicio}</strong> a <strong>${reservaActualizada.hora_fin}</strong> fue rechazada.</p>
                 ${motivoRechazo ? `<p>Motivo: ${motivoRechazo}</p>` : ''}`
        });
      }
    } catch (emailError) {
      console.warn('Error al enviar correo de rechazo de reserva:', emailError);
    }

    return res.status(200).json({ exito: true, reserva: reservaActualizada });
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
