const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await verificarAdmin(req.headers.authorization);

    const { eventoId } = req.body;
    if (!eventoId) return res.status(400).json({ error: 'Falta eventoId.' });

    const supabaseAdmin = obtenerClienteAdmin();

    const { error } = await supabaseAdmin
      .from('eventos_fijos')
      .delete()
      .eq('id', eventoId);

    if (error) throw error;

    return res.status(200).json({ exito: true });
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
