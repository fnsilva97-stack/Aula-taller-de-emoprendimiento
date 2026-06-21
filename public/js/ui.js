// Controlador de interfaz (UI)

const UI = {
  perfilActual: null,
  fechaSemanaActual: null, // lunes de la semana mostrada
  inventarioCache: [],

  // ---------------- Inicialización ----------------
  async init() {
    this.poblarSelectsHora();
    this.fechaSemanaActual = this.obtenerLunesDeSemana(new Date());

    document.getElementById('form-login').addEventListener('submit', (e) => this.manejarLogin(e));
    document.getElementById('form-register').addEventListener('submit', (e) => this.manejarRegistro(e));
    document.getElementById('form-reserva').addEventListener('submit', (e) => this.manejarEnvioReserva(e));
    document.getElementById('form-evento-fijo').addEventListener('submit', (e) => this.manejarCrearEvento(e));
    document.getElementById('form-inventario').addEventListener('submit', (e) => this.manejarAgregarInventario(e));
    document.getElementById('form-reporte-uso').addEventListener('submit', (e) => this.manejarEnvioReporte(e));
    document.getElementById('form-exportar').addEventListener('submit', (e) => this.manejarExportarInforme(e));

    const ahoraInit = new Date();
    const selectMes = document.getElementById('export-mes');
    const inputAnio = document.getElementById('export-anio');
    if (selectMes) selectMes.value = String(ahoraInit.getMonth() + 1);
    if (inputAnio) inputAnio.value = ahoraInit.getFullYear();

    const sesion = await Auth.obtenerSesionActual();
    if (sesion) {
      const perfil = await Auth.obtenerPerfilActual();
      if (perfil && perfil.estado === 'aprobado') {
        this.perfilActual = perfil;
        this.mostrarApp();
        return;
      }
    }
    this.mostrarLogin();
    await this.cargarHorario(); // horario público, visible sin sesión
  },

  poblarSelectsHora() {
    const selectsInicio = ['res-hora-inicio', 'ev-hora-inicio', 'ev-hora-fin'];
    selectsInicio.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      select.innerHTML = '';
      for (let h = APP_CONFIG.HORA_APERTURA; h <= APP_CONFIG.HORA_CIERRE; h++) {
        const valor = `${String(h).padStart(2, '0')}:00`;
        const esReserva = id === 'res-hora-inicio';
        if (esReserva && h > APP_CONFIG.HORA_CIERRE - APP_CONFIG.DURACION_RESERVA_HORAS) continue;
        const opt = document.createElement('option');
        opt.value = valor;
        opt.textContent = esReserva ? `${valor} - ${Reservas.calcularHoraFin(valor)}` : valor;
        select.appendChild(opt);
      }
    });
  },

  // ---------------- Login / Registro ----------------
  cambiarTabLogin(tab) {
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('form-login').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
  },

  async manejarLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';
    const correo = document.getElementById('login-correo').value;
    const password = document.getElementById('login-password').value;

    try {
      const { perfil } = await Auth.iniciarSesion(correo, password);
      this.perfilActual = perfil;
      this.mostrarApp();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = '';
    }
  },

  async manejarRegistro(e) {
    e.preventDefault();
    const errorEl = document.getElementById('register-error');
    errorEl.style.display = 'none';
    const nombre = document.getElementById('reg-nombre').value;
    const cedula = document.getElementById('reg-cedula').value;
    const correo = document.getElementById('reg-correo').value;
    const tipo = document.getElementById('reg-tipo').value;
    const password = document.getElementById('reg-password').value;

    try {
      await Auth.registrar(nombre, cedula, correo, tipo, password);
      this.mostrarToast('Solicitud enviada. El administrador revisara tu acceso y te notificara por correo.');
      this.cambiarTabLogin('login');
      document.getElementById('form-register').reset();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = '';
    }
  },

  async cerrarSesion() {
    await Auth.cerrarSesion();
    this.perfilActual = null;
    this.mostrarLogin();
    await this.cargarHorario();
  },

  mostrarLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
  },

  async mostrarApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';

    const esAdmin = this.perfilActual.tipo_usuario === 'admin';
    document.getElementById('navtab-admin').style.display = esAdmin ? '' : 'none';

    const infoEl = document.getElementById('usuario-actual-info');
    const etiquetaTipo = esAdmin ? 'Administrador' : (this.perfilActual.tipo_usuario === 'docente' ? 'Docente' : 'Estudiante');
    infoEl.innerHTML = `<i class="ti ti-user-circle"></i>&nbsp; Sesión activa: <strong>${this.escaparHtml(this.perfilActual.nombre_completo)}</strong> (${this.escaparHtml(this.perfilActual.correo)}) · ${etiquetaTipo}`;

    this.irAPagina('horario');
    await this.cargarHorario();

    document.getElementById('res-fecha').min = this.calcularFechaMinimaReserva();

    if (!esAdmin && !this.perfilActual.puede_reservar) {
      document.getElementById('reservar-form-wrap').style.display = 'none';
      document.getElementById('reservar-sin-acceso').style.display = '';
    } else {
      await this.cargarInventarioEnFormulario();
      this.agregarParticipante();
    }
  },

  calcularFechaMinimaReserva() {
    const minimo = new Date(Date.now() + APP_CONFIG.ANTICIPACION_MINIMA_HORAS * 60 * 60 * 1000);
    return minimo.toISOString().split('T')[0];
  },

  // ---------------- Navegacion ----------------
  irAPagina(pagina) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.navtab').forEach(t => t.classList.remove('active'));
    document.getElementById(`page-${pagina}`).classList.add('active');
    const tab = document.querySelector(`.navtab[data-page="${pagina}"]`);
    if (tab) tab.classList.add('active');

    if (pagina === 'mis-solicitudes') this.cargarMisSolicitudes();
    if (pagina === 'admin') this.cargarAdmin();
  },

  // ---------------- Calendario ----------------
  obtenerLunesDeSemana(fecha) {
    const d = new Date(fecha);
    const dia = d.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  formatearFechaISO(fecha) {
    return fecha.toISOString().split('T')[0];
  },

  async cambiarSemana(delta) {
    this.fechaSemanaActual.setDate(this.fechaSemanaActual.getDate() + delta * 7);
    await this.cargarHorario();
  },

  async cargarHorario() {
    const lunes = new Date(this.fechaSemanaActual);
    const viernes = new Date(lunes);
    viernes.setDate(viernes.getDate() + 4);

    const opciones = { day: 'numeric', month: 'short' };
    const textoSemana = `Semana del ${lunes.toLocaleDateString('es-CO', opciones)} al ${viernes.toLocaleDateString('es-CO', opciones)}`;

    const labelLogueado = document.getElementById('week-label');
    const labelPublico = document.getElementById('week-label-public');
    if (labelLogueado) labelLogueado.textContent = textoSemana;
    if (labelPublico) labelPublico.textContent = textoSemana;

    const fechaInicioISO = this.formatearFechaISO(lunes);
    const fechaFinISO = this.formatearFechaISO(viernes);

    const idContenedor = document.getElementById('main-app').style.display !== 'none' ? 'cal-container' : 'cal-container-public';

    try {
      const { reservas, eventosFijos } = await Reservas.obtenerHorarioSemana(fechaInicioISO, fechaFinISO);
      this.renderizarCalendario(lunes, reservas, eventosFijos, idContenedor);
    } catch (err) {
      const contenedor = document.getElementById(idContenedor);
      if (contenedor) contenedor.innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle"></i>Error al cargar el horario.</div>`;
      console.error(err);
    }
  },

  renderizarCalendario(lunes, reservas, eventosFijos, idContenedor = 'cal-container') {
    const dias = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(lunes);
      d.setDate(d.getDate() + i);
      dias.push(d);
    }

    let html = '<div class="cal-grid">';
    html += '<div class="cal-head"></div>';
    const nombresDias = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'];
    dias.forEach((d, i) => {
      html += `<div class="cal-head">${nombresDias[i]} ${d.getDate()}</div>`;
    });

    for (let h = APP_CONFIG.HORA_APERTURA; h < APP_CONFIG.HORA_CIERRE; h++) {
      html += `<div class="cal-time">${h}:00</div>`;
      dias.forEach((d, idxDia) => {
        const fechaISO = this.formatearFechaISO(d);
        const diaSemanaNum = idxDia + 1;

        const reservaEnHora = reservas.find(r => r.fecha === fechaISO && parseInt(r.hora_inicio) <= h && parseInt(r.hora_fin) > h);
        const eventoEnHora = eventosFijos.find(ev =>
          ev.dia_semana === diaSemanaNum &&
          fechaISO >= ev.fecha_inicio && fechaISO <= ev.fecha_fin &&
          parseInt(ev.hora_inicio) <= h && parseInt(ev.hora_fin) > h
        );

        html += '<div class="cal-cell">';
        if (eventoEnHora) {
          const claseCss = eventoEnHora.tipo === 'clase' ? 'ev-clase' : 'ev-bloqueo';
          html += `<div class="cal-event ${claseCss}">${this.escaparHtml(eventoEnHora.titulo)}</div>`;
        } else if (reservaEnHora) {
          const textoReserva = reservaEnHora.nombre_solicitante || 'Ocupado';
          html += `<div class="cal-event ev-reserva">${this.escaparHtml(textoReserva)}</div>`;
        }
        html += '</div>';
      });
    }
    html += '</div>';
    document.getElementById(idContenedor).innerHTML = html;
  },

  // ---------------- Formulario de reserva ----------------
  agregarParticipante() {
    const cont = document.getElementById('participantes-lista');
    const fila = document.createElement('div');
    fila.className = 'dyn-row';
    fila.innerHTML = `
      <input type="text" placeholder="Nombre completo" class="participante-nombre" required>
      <input type="text" placeholder="Numero de documento" class="participante-documento" required>
      <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
    `;
    cont.appendChild(fila);
  },

  async cargarInventarioEnFormulario() {
    try {
      this.inventarioCache = await Reservas.obtenerInventario();
    } catch (err) {
      console.error('Error al cargar inventario:', err);
      this.inventarioCache = [];
    }
    document.getElementById('elementos-lista').innerHTML = '';
    this.agregarElemento();
  },

  agregarElemento() {
    const cont = document.getElementById('elementos-lista');
    const fila = document.createElement('div');
    fila.className = 'dyn-row';
    const opciones = this.inventarioCache.map(i => `<option value="${this.escaparHtml(i.nombre)}">${this.escaparHtml(i.nombre)}</option>`).join('');
    fila.innerHTML = `
      <select class="elemento-nombre">${opciones || '<option value="">Sin elementos configurados</option>'}</select>
      <input type="number" placeholder="Cant." min="1" value="1" class="elemento-cantidad">
      <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
    `;
    cont.appendChild(fila);
  },

  async manejarEnvioReserva(e) {
    e.preventDefault();
    const errorEl = document.getElementById('reserva-error');
    errorEl.style.display = 'none';
    const btn = document.getElementById('btn-enviar-reserva');
    btn.disabled = true;

    try {
      const fecha = document.getElementById('res-fecha').value;
      const horaInicio = document.getElementById('res-hora-inicio').value;
      const motivo = document.getElementById('res-motivo').value;
      const aceptoDisclaimer = document.getElementById('chk-disclaimer').checked;

      const participantes = Array.from(document.querySelectorAll('#participantes-lista .dyn-row')).map(fila => ({
        nombre: fila.querySelector('.participante-nombre').value.trim(),
        documento: fila.querySelector('.participante-documento').value.trim()
      })).filter(p => p.nombre && p.documento);

      const elementos = Array.from(document.querySelectorAll('#elementos-lista .dyn-row')).map(fila => ({
        nombre: fila.querySelector('.elemento-nombre').value,
        cantidad: parseInt(fila.querySelector('.elemento-cantidad').value) || 1
      })).filter(el => el.nombre);

      await Reservas.crearSolicitud({ fecha, horaInicio, motivo, participantes, elementos, aceptoDisclaimer });

      this.mostrarToast('Solicitud enviada. El horario estaba libre, tu reserva quedo aprobada automaticamente.');
      document.getElementById('form-reserva').reset();
      document.getElementById('elementos-lista').innerHTML = '';
      document.getElementById('participantes-lista').innerHTML = '';
      this.agregarParticipante();
      this.agregarElemento();
      await this.cargarHorario();
      this.irAPagina('mis-solicitudes');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = '';
    } finally {
      btn.disabled = false;
    }
  },

  // ---------------- Mis solicitudes ----------------
  async cargarMisSolicitudes() {
    const tbody = document.getElementById('mis-solicitudes-body');
    const vacio = document.getElementById('mis-solicitudes-vacio');
    const banner = document.getElementById('reportes-pendientes-banner');
    try {
      const solicitudes = await Reservas.obtenerMisSolicitudes();
      if (solicitudes.length === 0) {
        tbody.innerHTML = '';
        vacio.style.display = '';
        banner.style.display = 'none';
        return;
      }
      vacio.style.display = 'none';

      const hayPendientes = solicitudes.some(s => Reservas.necesitaReporte(s));
      banner.style.display = hayPendientes ? '' : 'none';

      tbody.innerHTML = solicitudes.map(s => `
        <tr>
          <td>${this.formatearFechaLegible(s.fecha)}</td>
          <td>${s.hora_inicio} - ${s.hora_fin}</td>
          <td>${this.escaparHtml(s.motivo)}</td>
          <td>${this.badgeEstado(s.estado)}</td>
          <td>${this.celdaAccionesMisSolicitudes(s)}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="5">Error al cargar tus solicitudes.</td></tr>`;
    }
  },

  celdaAccionesMisSolicitudes(s) {
    if (Reservas.necesitaReporte(s)) {
      return `<button class="btn btn-sm btn-primary" onclick="UI.abrirReporte('${s.id}', '${this.escaparHtml(s.fecha)}', '${s.hora_inicio}', '${s.hora_fin}')"><i class="ti ti-clipboard-check"></i> Reportar uso</button>`;
    }
    if (s.reporte_estado === 'sin_novedad') {
      return `<span class="badge badge-reporte-sin-novedad"><i class="ti ti-check"></i> Sin novedad</span>`;
    }
    if (s.reporte_estado === 'con_incidente') {
      return `<span class="badge badge-reporte-con-incidente"><i class="ti ti-alert-triangle"></i> Con incidente</span>`;
    }
    if (s.estado === 'pendiente' || s.estado === 'aprobada') {
      return `<button class="btn btn-sm btn-danger" onclick="UI.cancelarSolicitud('${s.id}')">Cancelar</button>`;
    }
    return '';
  },

  async cancelarSolicitud(id) {
    try {
      await Reservas.cancelar(id);
      this.mostrarToast('Solicitud cancelada.');
      await this.cargarMisSolicitudes();
      await this.cargarHorario();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  // ---------------- Admin ----------------
  async cargarAdmin() {
    try {
      const [pendientes, usuarios] = await Promise.all([
        Admin.obtenerSolicitudesPendientes(),
        Admin.obtenerUsuariosAprobados()
      ]);

      document.getElementById('metric-pendientes').textContent = pendientes.length;
      document.getElementById('metric-usuarios').textContent = usuarios.length;

      try {
        const totalReportesPendientes = await Admin.contarReportesPendientes();
        document.getElementById('metric-reportes-pendientes').textContent = totalReportesPendientes;
      } catch (err) {
        console.error('Error al contar reportes pendientes:', err);
        document.getElementById('metric-reportes-pendientes').textContent = '–';
      }

      document.getElementById('admin-pendientes-body').innerHTML = pendientes.length === 0
        ? `<tr><td colspan="5" style="color:var(--color-text-muted)">No hay solicitudes pendientes.</td></tr>`
        : pendientes.map(p => `
          <tr>
            <td>${this.escaparHtml(p.nombre_completo)}</td>
            <td>${this.escaparHtml(p.correo)}</td>
            <td>${p.tipo_usuario}</td>
            <td>${this.formatearFechaLegible(p.creado_en.split('T')[0])}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="UI.aprobarUsuario('${p.id}', true)">Aprobar con reserva</button>
              <button class="btn btn-sm" onclick="UI.aprobarUsuario('${p.id}', false)">Solo ver horario</button>
              <button class="btn btn-sm btn-danger" onclick="UI.rechazarUsuarioAdmin('${p.id}')">Rechazar</button>
            </td>
          </tr>
        `).join('');

      document.getElementById('admin-usuarios-body').innerHTML = usuarios.map(u => `
        <tr>
          <td>${this.escaparHtml(u.nombre_completo)}</td>
          <td>${this.escaparHtml(u.correo)}</td>
          <td>${u.tipo_usuario}</td>
          <td>${u.puede_reservar ? '<span class="badge badge-aprobada">Si</span>' : '<span class="badge badge-cancelada">No</span>'}</td>
          <td>${u.tipo_usuario !== 'admin' ? `<button class="btn btn-sm btn-danger" onclick="UI.revocarAccesoAdmin('${u.id}')">Revocar</button>` : ''}</td>
        </tr>
      `).join('');

      await this.cargarReservasAdmin();
      await this.cargarEventosAdmin();
      await this.cargarInventarioAdmin();
    } catch (err) {
      console.error('Error al cargar panel admin:', err);
      this.mostrarToast('Error al cargar el panel de administracion.', true);
    }
  },

  async cargarReservasAdmin() {
    const lunes = new Date(this.fechaSemanaActual);
    const viernes = new Date(lunes);
    viernes.setDate(viernes.getDate() + 4);

    try {
      const reservas = await Admin.obtenerTodasLasReservas(this.formatearFechaISO(lunes), this.formatearFechaISO(viernes));
      document.getElementById('metric-reservas').textContent = reservas.filter(r => r.estado === 'aprobada').length;

      document.getElementById('admin-reservas-body').innerHTML = reservas.length === 0
        ? `<tr><td colspan="7" style="color:var(--color-text-muted)">No hay reservas esta semana.</td></tr>`
        : reservas.map(r => `
          <tr>
            <td>${this.formatearFechaLegible(r.fecha)}</td>
            <td>${r.hora_inicio} - ${r.hora_fin}</td>
            <td>${r.profiles ? this.escaparHtml(r.profiles.nombre_completo) : '-'}</td>
            <td>${this.escaparHtml(r.motivo)}</td>
            <td>${this.badgeEstado(r.estado)}</td>
            <td>${this.celdaReporteAdmin(r)}</td>
            <td>${r.estado === 'aprobada' || r.estado === 'pendiente' ? `<button class="btn btn-sm btn-danger" onclick="UI.rechazarReservaAdmin('${r.id}')">Rechazar</button>` : ''}</td>
          </tr>
        `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async cargarEventosAdmin() {
    try {
      const { data: eventos, error } = await supabaseClient.from('eventos_fijos').select('*').order('dia_semana');
      if (error) throw error;
      const nombresDias = { 1: 'Lunes', 2: 'Martes', 3: 'Miercoles', 4: 'Jueves', 5: 'Viernes' };
      document.getElementById('admin-eventos-body').innerHTML = (eventos || []).length === 0
        ? `<tr><td colspan="6" style="color:var(--color-text-muted)">No hay eventos fijos configurados.</td></tr>`
        : eventos.map(ev => `
          <tr>
            <td>${ev.tipo === 'clase' ? '<span class="badge badge-aprobada">Clase</span>' : '<span class="badge badge-cancelada">Bloqueo</span>'}</td>
            <td>${this.escaparHtml(ev.titulo)}</td>
            <td>${nombresDias[ev.dia_semana]}</td>
            <td>${ev.hora_inicio} - ${ev.hora_fin}</td>
            <td>${this.formatearFechaLegible(ev.fecha_inicio)} a ${this.formatearFechaLegible(ev.fecha_fin)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="UI.eliminarEventoAdmin('${ev.id}')"><i class="ti ti-trash"></i></button></td>
          </tr>
        `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async cargarInventarioAdmin() {
    try {
      const inventario = await Reservas.obtenerInventario();
      document.getElementById('admin-inventario-body').innerHTML = inventario.length === 0
        ? `<tr><td colspan="3" style="color:var(--color-text-muted)">No hay elementos en el inventario.</td></tr>`
        : inventario.map(i => `
          <tr>
            <td>${this.escaparHtml(i.nombre)}</td>
            <td>${i.cantidad_disponible}</td>
            <td><button class="btn btn-sm btn-danger" onclick="UI.eliminarElementoAdmin('${i.id}')"><i class="ti ti-trash"></i></button></td>
          </tr>
        `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  celdaReporteAdmin(r) {
    if (r.reporte_estado === 'sin_novedad') {
      return `<span class="badge badge-reporte-sin-novedad"><i class="ti ti-check"></i> Sin novedad</span>`;
    }
    if (r.reporte_estado === 'con_incidente') {
      return `<span class="badge badge-reporte-con-incidente" title="${this.escaparHtml(r.reporte_descripcion || '')}"><i class="ti ti-alert-triangle"></i> Con incidente</span>`;
    }
    if (Reservas.necesitaReporte(r)) {
      return `<button class="btn btn-sm" onclick="UI.abrirReporte('${r.id}', '${r.fecha}', '${r.hora_inicio}', '${r.hora_fin}', true)"><i class="ti ti-clipboard-check"></i> Reportar</button>`;
    }
    return `<span class="badge badge-reporte-pendiente">No aplica aún</span>`;
  },

  cambiarSubtabAdmin(tab) {
    document.querySelectorAll('.subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.admin-subtab').forEach(s => s.style.display = 'none');
    document.getElementById(`admin-${tab}`).style.display = '';
  },

  async aprobarUsuario(id, puedeReservar) {
    try {
      await Admin.aprobarUsuario(id, puedeReservar);
      this.mostrarToast('Acceso aprobado. Se notificara al usuario por correo.');
      await this.cargarAdmin();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  async rechazarUsuarioAdmin(id) {
    try {
      await Admin.rechazarUsuario(id);
      this.mostrarToast('Solicitud de acceso rechazada.');
      await this.cargarAdmin();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  async revocarAccesoAdmin(id) {
    try {
      await Admin.revocarAcceso(id);
      this.mostrarToast('Acceso revocado.');
      await this.cargarAdmin();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  async rechazarReservaAdmin(id) {
    const motivo = prompt('Motivo del rechazo (opcional):') || '';
    try {
      await Admin.rechazarReserva(id, motivo);
      this.mostrarToast('Reserva rechazada. Se notificara al solicitante.');
      await this.cargarReservasAdmin();
      await this.cargarHorario();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  async manejarCrearEvento(e) {
    e.preventDefault();
    const errorEl = document.getElementById('evento-error');
    errorEl.style.display = 'none';
    try {
      const evento = {
        tipo: document.getElementById('ev-tipo').value,
        titulo: document.getElementById('ev-titulo').value,
        diaSemana: parseInt(document.getElementById('ev-dia').value),
        horaInicio: document.getElementById('ev-hora-inicio').value,
        horaFin: document.getElementById('ev-hora-fin').value,
        fechaInicio: document.getElementById('ev-fecha-inicio').value,
        fechaFin: document.getElementById('ev-fecha-fin').value
      };
      await Admin.crearEventoFijo(evento);
      this.mostrarToast('Evento agregado al horario.');
      document.getElementById('form-evento-fijo').reset();
      await this.cargarEventosAdmin();
      await this.cargarHorario();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = '';
    }
  },

  async eliminarEventoAdmin(id) {
    try {
      await Admin.eliminarEventoFijo(id);
      this.mostrarToast('Evento eliminado.');
      await this.cargarEventosAdmin();
      await this.cargarHorario();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  async manejarAgregarInventario(e) {
    e.preventDefault();
    try {
      const nombre = document.getElementById('inv-nombre').value;
      const cantidad = parseInt(document.getElementById('inv-cantidad').value);
      await Admin.agregarElementoInventario(nombre, cantidad);
      this.mostrarToast('Elemento agregado al inventario.');
      document.getElementById('form-inventario').reset();
      document.getElementById('inv-cantidad').value = 1;
      await this.cargarInventarioAdmin();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  async eliminarElementoAdmin(id) {
    try {
      await Admin.eliminarElementoInventario(id);
      this.mostrarToast('Elemento eliminado del inventario.');
      await this.cargarInventarioAdmin();
    } catch (err) {
      this.mostrarToast(err.message, true);
    }
  },

  async manejarExportarInforme(e) {
    e.preventDefault();
    const errorEl = document.getElementById('exportar-error');
    errorEl.style.display = 'none';
    const btn = document.getElementById('btn-exportar-informe');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader"></i> Generando...';

    try {
      const mes = parseInt(document.getElementById('export-mes').value);
      const anio = parseInt(document.getElementById('export-anio').value);

      const resultado = await Admin.exportarInformeMensual(mes, anio);

      const binario = atob(resultado.archivo);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resultado.nombreArchivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.mostrarToast(`Informe generado con ${resultado.totalReservas} reserva(s).`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = '';
    } finally {
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
    }
  },

  // ---------------- Reporte de uso ----------------
  reporteTipoSeleccionado: null,
  reporteEsAdmin: false,

  abrirReporte(reservaId, fecha, horaInicio, horaFin, esAdmin = false) {
    this.reporteTipoSeleccionado = null;
    this.reporteEsAdmin = esAdmin;
    document.getElementById('reporte-reserva-id').value = reservaId;
    document.getElementById('reporte-detalle-reserva').textContent = `Reserva del ${this.formatearFechaLegible(fecha)}, ${horaInicio} – ${horaFin}.`;
    document.getElementById('reporte-descripcion').value = '';
    document.getElementById('reporte-descripcion-wrap').style.display = 'none';
    document.getElementById('btn-reporte-sin-novedad').classList.remove('btn-toggle-selected');
    document.getElementById('btn-reporte-con-incidente').classList.remove('btn-toggle-selected', 'danger');
    document.getElementById('btn-enviar-reporte').disabled = true;
    document.getElementById('reporte-error').style.display = 'none';
    document.getElementById('reporte-modal').classList.add('show');
  },

  cerrarReporte() {
    document.getElementById('reporte-modal').classList.remove('show');
  },

  seleccionarTipoReporte(tipo) {
    this.reporteTipoSeleccionado = tipo;
    document.getElementById('btn-reporte-sin-novedad').classList.toggle('btn-toggle-selected', tipo === 'sin_novedad');
    document.getElementById('btn-reporte-con-incidente').classList.toggle('btn-toggle-selected', tipo === 'con_incidente');
    document.getElementById('btn-reporte-con-incidente').classList.toggle('danger', tipo === 'con_incidente');
    document.getElementById('reporte-descripcion-wrap').style.display = tipo === 'con_incidente' ? '' : 'none';
    document.getElementById('btn-enviar-reporte').disabled = false;
  },

  async manejarEnvioReporte(e) {
    e.preventDefault();
    const errorEl = document.getElementById('reporte-error');
    errorEl.style.display = 'none';

    if (!this.reporteTipoSeleccionado) {
      errorEl.textContent = 'Selecciona si el espacio quedó sin novedad o con incidente.';
      errorEl.style.display = '';
      return;
    }

    const reservaId = document.getElementById('reporte-reserva-id').value;
    const descripcion = document.getElementById('reporte-descripcion').value;

    try {
      if (this.reporteEsAdmin) {
        await Admin.reportarUso(reservaId, this.reporteTipoSeleccionado, descripcion);
      } else {
        await Reservas.enviarReporteUso(reservaId, { estado: this.reporteTipoSeleccionado, descripcion });
      }
      this.mostrarToast('Reporte de uso enviado. Gracias por mantener el registro del espacio.');
      this.cerrarReporte();
      if (this.reporteEsAdmin) {
        await this.cargarReservasAdmin();
      } else {
        await this.cargarMisSolicitudes();
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = '';
    }
  },

  // ---------------- QR ----------------
  mostrarQR() {
    const wrap = document.getElementById('qr-canvas-wrap');
    wrap.innerHTML = '';
    new QRCode(wrap, {
      text: window.location.href,
      width: 200,
      height: 200,
      colorDark: '#1f2421',
      colorLight: '#ffffff'
    });
    document.getElementById('qr-url-text').textContent = window.location.href;
    document.getElementById('qr-modal').classList.add('show');
  },

  copiarEnlaceQR() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.mostrarToast('Enlace copiado al portapapeles.');
    }).catch(() => {
      this.mostrarToast('No se pudo copiar automáticamente. Copia el enlace manualmente.', true);
    });
  },

  cerrarQR() {
    document.getElementById('qr-modal').classList.remove('show');
  },

  // ---------------- Utilidades ----------------
  badgeEstado(estado) {
    const etiquetas = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
    return `<span class="badge badge-${estado}">${etiquetas[estado] || estado}</span>`;
  },

  formatearFechaLegible(fechaISO) {
    const [y, m, d] = fechaISO.split('-');
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto || '';
    return div.innerHTML;
  },

  mostrarToast(mensaje, esError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = mensaje;
    toast.classList.toggle('toast-error', esError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => UI.init());
