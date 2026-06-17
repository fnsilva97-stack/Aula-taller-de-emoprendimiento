// Helper compartido para las funciones serverless (api/*)
const { createClient } = require('@supabase/supabase-js');

// service_role key: tiene acceso total, se usa SOLO aquí en el servidor.
// Se configura como variable de entorno en Vercel, nunca se sube al código.
function obtenerClienteAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Verifica que el token de autorización pertenece a un usuario con rol admin.
// Lanza un error si no es válido o no es admin.
async function verificarAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No autorizado: falta token.');
  }
  const token = authHeader.replace('Bearer ', '');
  const supabaseAdmin = obtenerClienteAdmin();

  const { data: userData, error: errUser } = await supabaseAdmin.auth.getUser(token);
  if (errUser || !userData.user) {
    throw new Error('No autorizado: token inválido.');
  }

  const { data: perfil, error: errPerfil } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .single();

  if (errPerfil || !perfil || perfil.tipo_usuario !== 'admin') {
    throw new Error('No autorizado: se requiere rol de administrador.');
  }

  return perfil;
}

module.exports = { obtenerClienteAdmin, verificarAdmin };
