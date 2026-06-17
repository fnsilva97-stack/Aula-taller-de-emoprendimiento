const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await verificarAdmin(req.headers.authorization);

    const { perfilId, puedeReservar } = req.body;
    if (!perfilId) return res.status(400).json({ error: 'Falta perfilId.' });

    const supabaseAdmin = obtenerClienteAdmin();

    const { data: perfilActualizado, error } = await supabaseAdmin
      .from('profiles')
      .update({ estado: 'aprobado', puede_reservar: !!puedeReservar })
      .eq('id', perfilId)
      .select()
      .single();

    if (error) throw error;

    // Enviar correo de notificación (best-effort, no bloquea la respuesta si falla)
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_REMITENTE || 'estudio@unimagdalena.edu.co',
          to: perfilActualizado.correo,
          subject: 'Acceso aprobado - Estudio de Grabación',
          html: `<p>Hola ${perfilActualizado.nombre_completo},</p>
                 <p>Tu acceso al sistema del Estudio de Grabación ha sido <strong>aprobado</strong>.</p>
                 ${puedeReservar ? '<p>Ya puedes iniciar sesión y solicitar reservas del espacio.</p>' : '<p>Ya puedes iniciar sesión y consultar el horario del estudio.</p>'}`
        });
      }
    } catch (emailError) {
      console.warn('Error al enviar correo de aprobación:', emailError);
    }

    return res.status(200).json({ exito: true, perfil: perfilActualizado });
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
