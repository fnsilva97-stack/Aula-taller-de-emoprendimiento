const { obtenerClienteAdmin, verificarAdmin } = require('./_helpers');
const ExcelJS = require('exceljs');
const path = require('path');

// Mapeo de celdas según la plantilla institucional "Formato de préstamo y/o traslado de bienes"
const CELDAS = {
  fechaDia: 'C5', fechaMes: 'D5', fechaAnio: 'E5',
  devolDia: 'H5', devolMes: 'I5', devolAnio: 'J5',
  tipoInt: 'N5',
  nombre: 'K8',
  cedula: 'K9',
  cargo: 'K10',
  depEmpDir: 'K11',
  destino: 'K12',
  elementosFilaInicio: 15, // hasta fila 24 (10 elementos máx por hoja)
  elementosFilaFin: 24,
  colElemento: 'B',
  colCantidad: 'I',
  otrosSolicitantesFilaInicio: 38, // hasta fila 40 (3 filas)
  otrosSolicitantesFilaFin: 40,
  colOtroNombre: 'B',
  colOtroCedula: 'F',
  colOtroCargo: 'H',
  colOtroDepEmpDir: 'J'
};

function nombreHojaValido(texto, indice) {
  // Excel no permite ciertos caracteres en nombres de hoja y limita a 31 caracteres
  const limpio = texto.replace(/[\\/?*[\]:]/g, '').substring(0, 25);
  return `${indice}. ${limpio}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await verificarAdmin(req.headers.authorization);

    const { mes, anio } = req.body; // mes: 1-12
    if (!mes || !anio) {
      return res.status(400).json({ error: 'Faltan mes o año.' });
    }

    const supabaseAdmin = obtenerClienteAdmin();

    const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anio, mes, 0).getDate();
    const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

    const { data: reservas, error } = await supabaseAdmin
      .from('reservas')
      .select('*, profiles!reservas_solicitante_id_fkey(nombre_completo, cedula, tipo_usuario, correo)')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .eq('estado', 'aprobada')
      .order('fecha', { ascending: true });

    if (error) throw error;

    if (!reservas || reservas.length === 0) {
      return res.status(404).json({ error: 'No hay reservas aprobadas en ese mes.' });
    }

    const plantillaPath = path.join(process.cwd(), 'plantillas', 'plantilla_base.xlsx');
    const workbookPlantilla = new ExcelJS.Workbook();
    await workbookPlantilla.xlsx.readFile(plantillaPath);
    const hojaBase = workbookPlantilla.getWorksheet('Formato de prestamo');

    const workbookFinal = new ExcelJS.Workbook();

    for (let idx = 0; idx < reservas.length; idx++) {
      const reserva = reservas[idx];
      const perfil = reserva.profiles || {};

      const nombreHoja = nombreHojaValido(`${reserva.fecha}_${perfil.nombre_completo || 'Reserva'}`, idx + 1);
      const hoja = workbookFinal.addWorksheet(nombreHoja);

      // Clonar estructura de la hoja base (filas, columnas, merges, estilos)
      hojaBase.columns.forEach((col, i) => {
        hoja.getColumn(i + 1).width = col.width;
      });

      hojaBase.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const nuevaFila = hoja.getRow(rowNumber);
        nuevaFila.height = row.height;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const nuevaCelda = nuevaFila.getCell(colNumber);
          nuevaCelda.value = cell.value;
          nuevaCelda.style = JSON.parse(JSON.stringify(cell.style));
        });
      });

      hojaBase.model.merges.forEach(rango => {
        try { hoja.mergeCells(rango); } catch (e) { /* ignorar merges duplicados */ }
      });

      // Configuración de impresión: horizontal, ajustada a 1 página de ancho
      hoja.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9 // A4
      };

      // ---- Llenar datos de la reserva ----
      const [anioReserva, mesReserva, diaReserva] = reserva.fecha.split('-');

      hoja.getCell(CELDAS.fechaDia).value = parseInt(diaReserva);
      hoja.getCell(CELDAS.fechaMes).value = parseInt(mesReserva);
      hoja.getCell(CELDAS.fechaAnio).value = parseInt(anioReserva);

      hoja.getCell(CELDAS.devolDia).value = parseInt(diaReserva);
      hoja.getCell(CELDAS.devolMes).value = parseInt(mesReserva);
      hoja.getCell(CELDAS.devolAnio).value = parseInt(anioReserva);

      hoja.getCell(CELDAS.tipoInt).value = 'x';

      hoja.getCell(CELDAS.nombre).value = perfil.nombre_completo || '';
      hoja.getCell(CELDAS.cedula).value = perfil.cedula || '';
      hoja.getCell(CELDAS.cargo).value = perfil.tipo_usuario === 'docente' ? 'Docente' : 'Estudiante';
      hoja.getCell(CELDAS.depEmpDir).value = 'CREO';
      hoja.getCell(CELDAS.destino).value = 'Aula taller';

      // Elementos (máximo 10 filas disponibles en la plantilla)
      const elementos = Array.isArray(reserva.elementos) ? reserva.elementos : [];
      for (let i = 0; i < elementos.length && i < (CELDAS.elementosFilaFin - CELDAS.elementosFilaInicio + 1); i++) {
        const fila = CELDAS.elementosFilaInicio + i;
        hoja.getCell(`${CELDAS.colElemento}${fila}`).value = elementos[i].nombre || '';
        hoja.getCell(`${CELDAS.colCantidad}${fila}`).value = elementos[i].cantidad || 1;
      }

      // Participantes adicionales (el primero ya es el solicitante principal)
      const participantes = Array.isArray(reserva.participantes) ? reserva.participantes : [];
      const otros = participantes.slice(1); // el primero ya se considera el solicitante (1)
      const maxOtros = CELDAS.otrosSolicitantesFilaFin - CELDAS.otrosSolicitantesFilaInicio + 1;
      for (let i = 0; i < otros.length && i < maxOtros; i++) {
        const fila = CELDAS.otrosSolicitantesFilaInicio + i;
        hoja.getCell(`${CELDAS.colOtroNombre}${fila}`).value = otros[i].nombre || '';
        hoja.getCell(`${CELDAS.colOtroCedula}${fila}`).value = otros[i].documento || '';
        hoja.getCell(`${CELDAS.colOtroCargo}${fila}`).value = perfil.tipo_usuario === 'docente' ? 'Docente' : 'Estudiante';
        hoja.getCell(`${CELDAS.colOtroDepEmpDir}${fila}`).value = 'CREO';
      }

      // Observaciones: incluir motivo de la reserva y, si aplica, el reporte de incidente
      let observaciones = `Motivo: ${reserva.motivo || ''}`;
      if (reserva.reporte_estado === 'con_incidente' && reserva.reporte_descripcion) {
        observaciones += ` | Incidente reportado: ${reserva.reporte_descripcion}`;
      }
      hoja.getCell('A32').value = observaciones;
    }

    const buffer = await workbookFinal.xlsx.writeBuffer();
    const base64 = buffer.toString('base64');

    const nombresMeses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const nombreArchivo = `informe_prestamos_${nombresMeses[mes - 1]}_${anio}.xlsx`;

    return res.status(200).json({ exito: true, archivo: base64, nombreArchivo, totalReservas: reservas.length });

  } catch (error) {
    console.error('Error en exportar-informe-mensual:', error);
    return res.status(500).json({ error: error.message || 'Error al generar el informe.' });
  }
};
