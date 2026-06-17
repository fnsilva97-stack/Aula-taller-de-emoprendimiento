// Módulo de reservas

const Reservas = {

  validarAnticipacion(fecha, horaInicio) {
    const fechaHoraReserva = new Date(`${fecha}T${horaInicio}:00`);
    const ahora = new Date();
    const horasDeAnticipacion = (fechaHoraReserva - ahora) / (1000 * 60 * 60);

    if (horasDeAnticipacion < APP_CONFIG.ANTICIPACION_MINIMA_HORAS) {
      throw new Error(`La reserva debe solicitarse con al menos ${APP_CONFIG.ANTICIPACION_MINIMA_HORAS} horas de anticipación.`);
    }
  },

  validarDentroDeHorario(fecha, horaInicio, horaFin) {
    const diaSemana = new Date(`${fecha}T00:00:00`).getDay(); // 0=domingo
    const diaSemanaISO = diaSemana === 0 ? 7 : diaSemana; // convertir a 1=lunes...7=domingo

    if (!APP_CONFIG.DIAS_OPERACION.includes(diaSemanaISO)) {
      throw new Error('El estudio solo opera de lunes a viernes.');
    }

    const [hIni] = horaInicio.split(':').map(Number);
    const [hFin] = horaFin.split(':').map(Number);

    if (hIni < APP_CONFIG.HORA_APERTURA || hFin > APP_CONFIG.HORA_CIERRE) {
      throw new Error(`El horario de operación es de ${APP_CONFIG.HORA_APERTURA}:00 a ${APP_CONFIG.HORA_CIERRE}:00.`);
    }
  },

  calcularHoraFin(horaInicio) {
    const [h, m] = horaInicio.split(':').map(Number);
    const hFin = h + APP_CONFIG.DURACION_RESERVA_HORAS;
    return `${String(hFin).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  async crearSolicitud({ fecha, horaInicio, motivo, participantes, elementos, aceptoDisclaimer }) {
    if (!aceptoDisclaimer) {
      throw new Error('Debes aceptar el compromiso de uso responsable del espacio.');
    }
    if (!motivo || motivo.trim().length === 0) {
      throw new Error('Debes indicar el motivo de la reserva.');
    }
    if (!participantes || participantes.length === 0) {
      throw new Error('Debes indicar al menos un participante.');
    }

    const horaFin = this.calcularHoraFin(horaInicio);

    this.validarAnticipacion(fecha, horaInicio);
    this.validarDentroDeHorario(fecha, horaInicio, horaFin);

    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData.user) throw new Error('Debes iniciar sesión.');

    const { data, error } = await supabaseClient
      .from('reservas')
      .insert({
        solicitante_id: userData.user.id,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        motivo: motivo.trim(),
        participantes,
        elementos,
        acepto_disclaimer: true,
        estado: 'aprobada' // aprobación automática si el horario está libre (la BD impide choques)
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Ese horario ya fue reservado por otra persona. Por favor elige otra franja.');
      }
      throw error;
    }

    // Disparar notificación por correo (función serverless)
    try {
      await fetch('/api/notificar-reserva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservaId: data.id, tipo: 'aprobada' })
      });
    } catch (e) {
      console.warn('No se pudo enviar la notificación por correo:', e);
    }

    return data;
  },

  async obtenerHorarioSemana(fechaInicioISO, fechaFinISO) {
    const { data: reservas, error: errReservas } = await supabaseClient
      .from('reservas')
      .select('*, profiles(nombre_completo)')
      .gte('fecha', fechaInicioISO)
      .lte('fecha', fechaFinISO)
      .in('estado', ['pendiente', 'aprobada']);

    const { data: eventosFijos, error: errEventos } = await supabaseClient
      .from('eventos_fijos')
      .select('*')
      .lte('fecha_inicio', fechaFinISO)
      .gte('fecha_fin', fechaInicioISO);

    if (errReservas) throw errReservas;
    if (errEventos) throw errEventos;

    return { reservas: reservas || [], eventosFijos: eventosFijos || [] };
  },

  async obtenerMisSolicitudes() {
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData.user) return [];

    const { data, error } = await supabaseClient
      .from('reservas')
      .select('*')
      .eq('solicitante_id', userData.user.id)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async cancelar(reservaId) {
    const { error } = await supabaseClient
      .from('reservas')
      .update({ estado: 'cancelada' })
      .eq('id', reservaId);

    if (error) throw error;
  },

  async obtenerInventario() {
    const { data, error } = await supabaseClient
      .from('inventario')
      .select('*')
      .order('nombre');

    if (error) throw error;
    return data || [];
  }
};
