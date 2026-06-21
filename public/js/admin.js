// Módulo de administración
// Las acciones sensibles (aprobar usuarios, rechazar reservas, etc.) pasan
// por funciones serverless en /api que verifican que quien llama es admin
// y usan la service_role key del lado del servidor (nunca expuesta al navegador).

const Admin = {

  async _llamarApi(endpoint, body) {
    const sesion = await Auth.obtenerSesionActual();
    if (!sesion) throw new Error('No has iniciado sesión.');

    const respuesta = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sesion.access_token}`
      },
      body: JSON.stringify(body)
    });

    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error || 'Error al procesar la solicitud.');
    return resultado;
  },

  async obtenerSolicitudesPendientes() {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async obtenerUsuariosAprobados() {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('estado', 'aprobado')
      .order('nombre_completo');
    if (error) throw error;
    return data || [];
  },

  async aprobarUsuario(perfilId, puedeReservar) {
    return this._llamarApi('aprobar-usuario', { perfilId, puedeReservar });
  },

  async rechazarUsuario(perfilId) {
    return this._llamarApi('rechazar-usuario', { perfilId });
  },

  async revocarAcceso(perfilId) {
    return this._llamarApi('revocar-acceso', { perfilId });
  },

  async rechazarReserva(reservaId, motivoRechazo) {
    return this._llamarApi('rechazar-reserva', { reservaId, motivoRechazo });
  },

  async reportarUso(reservaId, estado, descripcion) {
    return this._llamarApi('reportar-uso-admin', { reservaId, estado, descripcion });
  },

  async crearEventoFijo(evento) {
    return this._llamarApi('crear-evento-fijo', evento);
  },

  async eliminarEventoFijo(eventoId) {
    return this._llamarApi('eliminar-evento-fijo', { eventoId });
  },

  async agregarElementoInventario(nombre, cantidad) {
    return this._llamarApi('gestionar-inventario', { accion: 'agregar', nombre, cantidad });
  },

  async eliminarElementoInventario(elementoId) {
    return this._llamarApi('gestionar-inventario', { accion: 'eliminar', elementoId });
  },

  async obtenerTodasLasReservas(fechaInicioISO, fechaFinISO) {
    const { data, error } = await supabaseClient
      .from('reservas')
      .select('*, profiles!reservas_solicitante_id_fkey(nombre_completo, correo)')
      .gte('fecha', fechaInicioISO)
      .lte('fecha', fechaFinISO)
      .order('fecha', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async contarReportesPendientes() {
    const hoy = new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseClient
      .from('reservas')
      .select('id, fecha, hora_fin')
      .eq('estado', 'aprobada')
      .eq('reporte_estado', 'pendiente')
      .lte('fecha', hoy);
    if (error) throw error;

    const ahora = new Date();
    return (data || []).filter(r => new Date(`${r.fecha}T${r.hora_fin}:00`) < ahora).length;
  },

  async exportarInformeMensual(mes, anio) {
    return this._llamarApi('exportar-informe-mensual', { mes, anio });
  }
};
