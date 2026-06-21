-- =====================================================
-- MIGRACIÓN: horario público (visible sin iniciar sesión)
-- =====================================================
-- Permite que cualquier persona, sin necesidad de cuenta, pueda ver
-- el horario semanal (clases, bloqueos y franjas ocupadas por reservas).
-- El nombre completo del solicitante de una reserva NO se expone aquí;
-- solo se muestra si el usuario tiene sesión iniciada (eso se controla
-- desde el código del frontend, pidiendo columnas distintas según el caso).

-- RESERVAS: permitir lectura también al rol anónimo (no autenticado)
drop policy if exists "reservas_lectura" on public.reservas;
create policy "reservas_lectura_publica" on public.reservas
  for select using (true);

-- EVENTOS FIJOS: permitir lectura también al rol anónimo
drop policy if exists "eventos_lectura" on public.eventos_fijos;
create policy "eventos_lectura_publica" on public.eventos_fijos
  for select using (true);

-- Verificar políticas resultantes
select tablename, policyname, cmd from pg_policies
where tablename in ('reservas', 'eventos_fijos')
order by tablename;
