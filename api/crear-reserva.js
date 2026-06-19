const { obtenerClienteAdmin } = require('./_helpers');

const APP_CONFIG = {
  HORA_APERTURA: 7,
  HORA_CIERRE: 20,
  DIAS_OPERACION: [1, 2, 3, 4, 5],
  DURACION_RESERVA_HORAS: 2,
  ANTICIPACION_MINIMA_HORAS: 24
};

function horaAMinutos(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

function calcularHoraFin(horaInicio) {
  const [h, m] = horaInicio.split(':').map(Number);
  const hFin = h + APP_CONFIG.DURACION_RESERVA_HORAS;
  return `${String(hFin).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado: falta token.' });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = obtenerClienteAdmin();

    const { data: userData, error: errUser } = await supabaseAdmin.auth.getUser(token);
    if (errUser || !userData.user) {
      return res.status(401).json({ error: 'No autorizado: token inválido.' });
    }

    const { data: perfil, error: errPerfil } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .single();

    if (errPerfil || !perfil) {
      return res.status(403).json({ error: 'Perfil no encontrado.' });
    }
    if (perfil.estado !== 'aprobado' || (!perfil.puede_reservar && perfil.tipo_usuario !== 'admin')) {
      return res.status(403).json({ error: 'No tienes permiso para hacer reservas.' });
    }

    const { fecha, horaInicio, motivo, participantes, elementos, aceptoDisclaimer } = req.body;

    if (!aceptoDisclaimer) {
      return res.status(400).json({ error: 'Debes aceptar el compromiso de uso responsable del espacio.' });
    }
    if (!motivo || motivo.trim().length === 0) {
      return res.status(400).json({ error: 'Debes indicar el motivo de la reserva.' });
    }
    if (!participantes || participantes.length === 0) {
      return res.status(400).json({ error: 'Debes indicar al menos un participante.' });
    }
    if (!fecha || !horaInicio) {
      return res.status(400).json({ error: 'Faltan fecha u hora de inicio.' });
    }

    const horaFin = calcularHoraFin(horaInicio);

    // Validar anticipación de 24h
    const fechaHoraReserva = new Date(`${fecha}T${horaInicio}:00`);
    const horasAnticipacion = (fechaHoraReserva - new Date()) / (1000 * 60 * 60);
    if (horasAnticipacion < APP_CONFIG.ANTICIPACION_MINIMA_HORAS) {
      return res.status(400).json({ error: `La reserva debe solicitarse con al menos ${APP_CONFIG.ANTICIPACION_MINIMA_HORAS} horas de anticipación.` });
    }

    // Validar dentro de horario de operación
    const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
    const diaSemanaISO = diaSemana === 0 ? 7 : diaSemana;
    if (!APP_CONFIG.DIAS_OPERACION.includes(diaSemanaISO)) {
      return res.status(400).json({ error: 'El estudio solo opera de lunes a viernes.' });
    }
    const [hIni] = horaInicio.split(':').map(Number);
    const [hFin] = horaFin.split(':').map(Number);
    if (hIni < APP_CONFIG.HORA_APERTURA || hFin > APP_CONFIG.HORA_CIERRE) {
      return res.status(400).json({ error: `El horario de operación es de ${APP_CONFIG.HORA_APERTURA}:00 a ${APP_CONFIG.HORA_CIERRE}:00.` });
    }

    // Validar choque con eventos fijos (clases/bloqueos)
    const { data: eventos, error: errEventos } = await supabaseAdmin
      .from('eventos_fijos')
      .select('*')
      .eq('dia_semana', diaSemanaISO)
      .lte('fecha_inicio', fecha)
      .gte('fecha_fin', fecha);

    if (errEventos) throw errEventos;

    const inicioMin = horaAMinutos(horaInicio);
    const finMin = horaAMinutos(horaFin);

    const choqueEvento = (eventos || []).find(ev => {
      const evInicio = horaAMinutos(ev.hora_inicio);
      const evFin = horaAMinutos(ev.hora_fin);
      return inicioMin < evFin && finMin > evInicio;
    });

    if (choqueEvento) {
      const tipoTexto = choqueEvento.tipo === 'clase' ? 'una clase programada' : 'un bloqueo del espacio';
      return res.status(409).json({ error: `Ese horario coincide con ${tipoTexto}: "${choqueEvento.titulo}" (${choqueEvento.hora_inicio}-${choqueEvento.hora_fin}). Elige otra franja.` });
    }

    // Insertar la reserva (la BD impide choques con otras reservas vía índice único)
    const { data: nuevaReserva, error: errInsert } = await supabaseAdmin
      .from('reservas')
      .insert({
        solicitante_id: perfil.id,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        motivo: motivo.trim(),
        participantes,
        elementos,
        acepto_disclaimer: true,
        estado: 'aprobada'
      })
      .select()
      .single();

    if (errInsert) {
      if (errInsert.code === '23505') {
        return res.status(409).json({ error: 'Ese horario ya fue reservado por otra persona. Por favor elige otra franja.' });
      }
      throw errInsert;
    }

    // Notificación por correo (best-effort)
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_REMITENTE || 'estudio@unimagdalena.edu.co',
          to: perfil.correo,
          subject: 'Reserva confirmada - Estudio de Grabación',
          html: `<p>Hola ${perfil.nombre_completo},</p>
                 <p>Tu reserva fue <strong>confirmada automáticamente</strong>:</p>
                 <ul>
                   <li>Fecha: ${fecha}</li>
                   <li>Horario: ${horaInicio} - ${horaFin}</li>
                   <li>Motivo: ${motivo}</li>
                 </ul>
                 <p>Recuerda llegar puntual y dejar el espacio en buen estado.</p>`
        });
      }
    } catch (emailError) {
      console.warn('Error al enviar correo de confirmación:', emailError);
    }

    return res.status(200).json({ exito: true, reserva: nuevaReserva });

  } catch (error) {
    console.error('Error en crear-reserva:', error);
    return res.status(500).json({ error: error.message || 'Error interno al crear la reserva.' });
  }
};
