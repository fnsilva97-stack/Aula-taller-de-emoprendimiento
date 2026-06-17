const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await verificarAdmin(req.headers.authorization);

    const { perfilId } = req.body;
    if (!perfilId) return res.status(400).json({ error: 'Falta perfilId.' });

    const supabaseAdmin = obtenerClienteAdmin();

    const { data: perfilActualizado, error } = await supabaseAdmin
      .from('profiles')
      .update({ estado: 'rechazado', puede_reservar: false })
      .eq('id', perfilId)
      .select()
      .single();

    if (error) throw error;

    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_REMITENTE || 'estudio@unimagdalena.edu.co',
          to: perfilActualizado.correo,
          subject: 'Solicitud de acceso - Estudio de Grabación',
          html: `<p>Hola ${perfilActualizado.nombre_completo},</p>
                 <p>Tu solicitud de acceso al sistema del Estudio de Grabación no fue aprobada.</p>
                 <p>Si crees que esto es un error, contacta al encargado del estudio.</p>`
        });
      }
    } catch (emailError) {
      console.warn('Error al enviar correo de rechazo:', emailError);
    }

    return res.status(200).json({ exito: true, perfil: perfilActualizado });
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
