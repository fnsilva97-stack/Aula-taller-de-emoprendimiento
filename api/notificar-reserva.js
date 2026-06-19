const { obtenerClienteAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const { reservaId } = req.body;
    if (!reservaId) return res.status(400).json({ error: 'Falta reservaId.' });

    const supabaseAdmin = obtenerClienteAdmin();

    const { data: reserva, error } = await supabaseAdmin
      .from('reservas')
      .select('*, profiles!reservas_solicitante_id_fkey(nombre_completo, correo)')
      .eq('id', reservaId)
      .single();

    if (error) throw error;

    if (process.env.RESEND_API_KEY && reserva.profiles) {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_REMITENTE || 'estudio@unimagdalena.edu.co',
        to: reserva.profiles.correo,
        subject: 'Reserva confirmada - Estudio de Grabación',
        html: `<p>Hola ${reserva.profiles.nombre_completo},</p>
               <p>Tu reserva fue <strong>confirmada automáticamente</strong>:</p>
               <ul>
                 <li>Fecha: ${reserva.fecha}</li>
                 <li>Horario: ${reserva.hora_inicio} - ${reserva.hora_fin}</li>
                 <li>Motivo: ${reserva.motivo}</li>
               </ul>
               <p>Recuerda llegar puntual y dejar el espacio en buen estado.</p>`
      });
    }

    return res.status(200).json({ exito: true });
  } catch (error) {
    console.warn('Error en notificar-reserva:', error);
    return res.status(200).json({ exito: false, error: error.message });
  }
};
