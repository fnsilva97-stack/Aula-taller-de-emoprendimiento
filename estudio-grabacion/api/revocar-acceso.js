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

    return res.status(200).json({ exito: true, perfil: perfilActualizado });
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
};
