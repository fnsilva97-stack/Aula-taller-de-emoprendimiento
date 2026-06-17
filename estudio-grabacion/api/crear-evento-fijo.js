const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const perfilAdmin = await verificarAdmin(req.headers.authorization);

    const { tipo, titulo, diaSemana, horaInicio, horaFin, fechaInicio, fechaFin } = req.body;

    if (!tipo || !titulo || !diaSemana || !horaInicio || !horaFin || !fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'Faltan campos requeridos.' });
    }

    const supabaseAdmin = obtenerClienteAdmin();

    const { data: nuevoEvento, error } = await supabaseAdmin
      .from('eventos_fijos')
      .insert({
        tipo,
        titulo,
        dia_semana: diaSemana,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        creado_por: perfilAdmin.id
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ exito: true, evento: nuevoEvento });
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
