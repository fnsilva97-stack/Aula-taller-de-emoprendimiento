-- =====================================================
-- MIGRACIÓN: reporte de uso después de cada reserva
-- =====================================================
-- Permite marcar cada reserva ya finalizada como "sin novedad" o
-- "con incidente" (con descripción), para tener trazabilidad de uso
-- y poder reaccionar ante daños o problemas en el espacio.

alter table public.reservas
  add column if not exists reporte_estado text
    check (reporte_estado in ('pendiente', 'sin_novedad', 'con_incidente'))
    default 'pendiente',
  add column if not exists reporte_descripcion text,
  add column if not exists reporte_por uuid references public.profiles(id),
  add column if not exists reporte_fecha timestamptz;

-- Las reservas canceladas o rechazadas no requieren reporte de uso
-- (nunca se llegó a usar el espacio), así que las marcamos como no aplicable.
update public.reservas
set reporte_estado = null
where estado in ('cancelada', 'rechazada');

-- Permitir que el propio solicitante actualice el reporte de su reserva
-- (ya existe la política reservas_cancelar_propia que permite update, pero
-- la dejamos explícita aquí por claridad - no se necesita política nueva,
-- reservas_cancelar_propia ya cubre cualquier update del dueño de la reserva).

select column_name, data_type from information_schema.columns
where table_name = 'reservas' and column_name like 'reporte%';
