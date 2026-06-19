-- =====================================================
-- MIGRACIÓN: reforzar seguridad de la tabla reservas
-- =====================================================
-- Ahora las reservas se crean SOLO a través de la función serverless
-- api/crear-reserva.js (usa la service_role key del servidor), que valida
-- en el backend: anticipación de 24h, horario de operación, choque con
-- clases/bloqueos programados y choque con otras reservas.
--
-- Por seguridad, eliminamos el permiso que dejaba crear reservas
-- directamente desde el navegador.

drop policy if exists "reservas_crear_propia" on public.reservas;

-- Verifica que la política ya no existe:
select policyname from pg_policies where tablename = 'reservas';
