const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await verificarAdmin(req.headers.authorization);

    const { accion, nombre, cantidad, elementoId } = req.body;
    const supabaseAdmin = obtenerClienteAdmin();

    if (accion === 'agregar') {
      if (!nombre || !cantidad) return res.status(400).json({ error: 'Faltan nombre o cantidad.' });

      const { data, error } = await supabaseAdmin
        .from('inventario')
        .insert({ nombre, cantidad_disponible: cantidad })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ exito: true, elemento: data });

    } else if (accion === 'eliminar') {
      if (!elementoId) return res.status(400).json({ error: 'Falta elementoId.' });

      const { error } = await supabaseAdmin
        .from('inventario')
        .delete()
        .eq('id', elementoId);

      if (error) throw error;
      return res.status(200).json({ exito: true });

    } else {
      return res.status(400).json({ error: 'Acción no reconocida.' });
    }
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
