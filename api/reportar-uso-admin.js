const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const perfilAdmin = await verificarAdmin(req.headers.authorization);

    const { reservaId, estado, descripcion } = req.body;
    if (!reservaId || !estado) return res.status(400).json({ error: 'Faltan reservaId o estado.' });
    if (!['sin_novedad', 'con_incidente'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de reporte no válido.' });
    }
    if (estado === 'con_incidente' && (!descripcion || descripcion.trim().length === 0)) {
      return res.status(400).json({ error: 'Debes describir el incidente ocurrido.' });
    }

    const supabaseAdmin = obtenerClienteAdmin();

    const { data: reservaActualizada, error } = await supabaseAdmin
      .from('reservas')
      .update({
        reporte_estado: estado,
        reporte_descripcion: descripcion ? descripcion.trim() : null,
        reporte_por: perfilAdmin.id,
        reporte_fecha: new Date().toISOString()
      })
      .eq('id', reservaId)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ exito: true, reserva: reservaActualizada });
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
