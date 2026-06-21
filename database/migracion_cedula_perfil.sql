-- =====================================================
-- MIGRACIÓN: agregar cédula al perfil de usuario
-- =====================================================
-- Necesario para el informe mensual de préstamo de elementos,
-- que requiere el número de documento del solicitante.

alter table public.profiles
  add column if not exists cedula text;

-- Actualizar el trigger que crea el perfil automáticamente al registrarse,
-- para que también guarde la cédula que ahora se pide en el formulario.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nombre_completo, cedula, correo, tipo_usuario, estado, puede_reservar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', 'Sin nombre'),
    new.raw_user_meta_data->>'cedula',
    new.email,
    coalesce(new.raw_user_meta_data->>'tipo_usuario', 'estudiante'),
    'pendiente',
    false
  );
  return new;
end;
$$ language plpgsql security definer;

select column_name, data_type from information_schema.columns
where table_name = 'profiles' and column_name = 'cedula';
