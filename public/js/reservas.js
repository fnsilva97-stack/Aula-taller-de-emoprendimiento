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

  async validarSinChoqueConEventoFijo(fecha, horaInicio, horaFin) {
    // Nota: esta validación también se aplica de forma definitiva en el servidor
    // (api/crear-reserva.js). Se mantiene aquí solo como feedback rápido opcional.
    const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
    const diaSemanaISO = diaSemana === 0 ? 7 : diaSemana;

    const { data: eventos, error } = await supabaseClient
      .from('eventos_fijos')
      .select('*')
      .eq('dia_semana', diaSemanaISO)
      .lte('fecha_inicio', fecha)
      .gte('fecha_fin', fecha);

    if (error) throw error;

    const inicioMin = this._horaAMinutos(horaInicio);
    const finMin = this._horaAMinutos(horaFin);

    const choque = (eventos || []).find(ev => {
      const evInicio = this._horaAMinutos(ev.hora_inicio);
      const evFin = this._horaAMinutos(ev.hora_fin);
      return inicioMin < evFin && finMin > evInicio;
    });

    if (choque) {
      const tipoTexto = choque.tipo === 'clase' ? 'una clase programada' : 'un bloqueo del espacio';
      throw new Error(`Ese horario coincide con ${tipoTexto}: "${choque.titulo}" (${choque.hora_inicio}–${choque.hora_fin}). Elige otra franja.`);
    }
  },

  _horaAMinutos(horaStr) {
    const [h, m] = horaStr.split(':').map(Number);
    return h * 60 + m;
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

    // Validaciones rápidas en el cliente (la validación definitiva ocurre en el servidor)
    const horaFin = this.calcularHoraFin(horaInicio);
    this.validarAnticipacion(fecha, horaInicio);
    this.validarDentroDeHorario(fecha, horaInicio, horaFin);

    const sesion = await Auth.obtenerSesionActual();
    if (!sesion) throw new Error('Debes iniciar sesión.');

    const respuesta = await fetch('/api/crear-reserva', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sesion.access_token}`
      },
      body: JSON.stringify({ fecha, horaInicio, motivo, participantes, elementos, aceptoDisclaimer })
    });

    const resultado = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(resultado.error || 'Error al crear la reserva.');
    }

    return resultado.reserva;
  },

  async obtenerHorarioSemana(fechaInicioISO, fechaFinISO) {
    const { data: reservas, error: errReservas } = await supabaseClient
      .from('reservas')
      .select('id, fecha, hora_inicio, hora_fin, estado, solicitante_id')
      .gte('fecha', fechaInicioISO)
      .lte('fecha', fechaFinISO)
      .in('estado', ['pendiente', 'aprobada']);

    if (errReservas) throw errReservas;

    const { data: eventosFijos, error: errEventos } = await supabaseClient
      .from('eventos_fijos')
      .select('*')
      .lte('fecha_inicio', fechaFinISO)
      .gte('fecha_fin', fechaInicioISO);

    if (errEventos) throw errEventos;

    // Si hay sesión iniciada, intentamos traer los nombres de los solicitantes
    // (la política de "profiles" requiere autenticación; sin sesión, simplemente
    // no se obtienen nombres y el calendario mostrará "Ocupado").
    const sesion = await Auth.obtenerSesionActual();
    let reservasConNombre = reservas || [];

    if (sesion && reservasConNombre.length > 0) {
      const idsSolicitantes = [...new Set(reservasConNombre.map(r => r.solicitante_id))];
      const { data: perfiles } = await supabaseClient
        .from('profiles')
        .select('id, nombre_completo')
        .in('id', idsSolicitantes);

      const mapaNombres = {};
      (perfiles || []).forEach(p => { mapaNombres[p.id] = p.nombre_completo; });

      reservasConNombre = reservasConNombre.map(r => ({
        ...r,
        nombre_solicitante: mapaNombres[r.solicitante_id] || 'Reserva'
      }));
    } else {
      reservasConNombre = reservasConNombre.map(r => ({ ...r, nombre_solicitante: null }));
    }

    return { reservas: reservasConNombre, eventosFijos: eventosFijos || [] };
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

  estaVencida(reserva) {
    const fechaHoraFin = new Date(`${reserva.fecha}T${reserva.hora_fin}:00`);
    return fechaHoraFin < new Date();
  },

  necesitaReporte(reserva) {
    return reserva.estado === 'aprobada' && this.estaVencida(reserva) && reserva.reporte_estado === 'pendiente';
  },

  async enviarReporteUso(reservaId, { estado, descripcion }) {
    if (estado === 'con_incidente' && (!descripcion || descripcion.trim().length === 0)) {
      throw new Error('Debes describir el incidente ocurrido.');
    }

    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData.user) throw new Error('Debes iniciar sesión.');

    const { error } = await supabaseClient
      .from('reservas')
      .update({
        reporte_estado: estado,
        reporte_descripcion: descripcion ? descripcion.trim() : null,
        reporte_por: userData.user.id,
        reporte_fecha: new Date().toISOString()
      })
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
