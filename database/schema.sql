-- =====================================================
-- ESQUEMA DE BASE DE DATOS
-- Estudio de Grabación - Universidad del Magdalena
-- Ejecutar este script completo en: Supabase > SQL Editor > New query
-- =====================================================

-- Extensión necesaria para generar UUIDs
create extension if not exists "uuid-ossp";

-- =====================================================
-- 1. TABLA DE PERFILES (extiende auth.users de Supabase)
-- =====================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  nombre_completo text not null,
  correo text not null unique,
  tipo_usuario text not null check (tipo_usuario in ('estudiante', 'docente', 'admin')),
  puede_reservar boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado_en timestamptz not null default now()
);

comment on table public.profiles is 'Perfiles de usuario, extiende la tabla de autenticación de Supabase';

-- =====================================================
-- 2. TABLA DE INVENTARIO (elementos disponibles en el estudio)
-- =====================================================
create table public.inventario (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  cantidad_disponible integer not null default 1,
  creado_en timestamptz not null default now()
);

-- =====================================================
-- 3. TABLA DE EVENTOS FIJOS (clases programadas y bloqueos)
-- =====================================================
create table public.eventos_fijos (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null check (tipo in ('clase', 'bloqueo')),
  titulo text not null,
  dia_semana integer not null check (dia_semana between 1 and 5), -- 1=lunes ... 5=viernes
  hora_inicio time not null,
  hora_fin time not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  creado_por uuid references public.profiles(id),
  creado_en timestamptz not null default now()
);

-- =====================================================
-- 4. TABLA DE RESERVAS
-- =====================================================
create table public.reservas (
  id uuid primary key default uuid_generate_v4(),
  solicitante_id uuid references public.profiles(id) not null,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  motivo text not null,
  participantes jsonb not null default '[]', -- [{nombre, documento}]
  elementos jsonb not null default '[]', -- [{nombre, cantidad}]
  acepto_disclaimer boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  motivo_rechazo text,
  creado_en timestamptz not null default now(),

  -- Restricción: la reserva debe durar exactamente 2 horas
  constraint duracion_2h check (
    extract(epoch from (hora_fin - hora_inicio)) = 7200
  )
);

-- Evitar dobles reservas en la misma franja (1 sola reserva simultánea por estudio)
create unique index unico_slot_activo
  on public.reservas (fecha, hora_inicio)
  where estado in ('pendiente', 'aprobada');

-- =====================================================
-- 5. FUNCIÓN: crear perfil automáticamente al registrarse
-- =====================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nombre_completo, correo, tipo_usuario, estado, puede_reservar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', 'Sin nombre'),
    new.email,
    coalesce(new.raw_user_meta_data->>'tipo_usuario', 'estudiante'),
    'pendiente',
    false
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- 6. SEGURIDAD: Row Level Security (RLS)
-- =====================================================
alter table public.profiles enable row level security;
alter table public.inventario enable row level security;
alter table public.eventos_fijos enable row level security;
alter table public.reservas enable row level security;

-- PROFILES: cualquier usuario autenticado puede leer todos los perfiles (para ver el horario)
create policy "perfiles_lectura_publica" on public.profiles
  for select using (auth.role() = 'authenticated');

-- PROFILES: un usuario puede actualizar su propio perfil (no su estado/permiso)
create policy "perfiles_update_propio" on public.profiles
  for update using (auth.uid() = id);

-- INVENTARIO: lectura pública para usuarios autenticados
create policy "inventario_lectura" on public.inventario
  for select using (auth.role() = 'authenticated');

-- EVENTOS FIJOS: lectura pública para usuarios autenticados
create policy "eventos_lectura" on public.eventos_fijos
  for select using (auth.role() = 'authenticated');

-- RESERVAS: cualquier autenticado puede ver todas las reservas (para el horario general)
create policy "reservas_lectura" on public.reservas
  for select using (auth.role() = 'authenticated');

-- RESERVAS: un usuario puede crear su propia reserva
create policy "reservas_crear_propia" on public.reservas
  for insert with check (auth.uid() = solicitante_id);

-- RESERVAS: un usuario puede cancelar (actualizar) su propia reserva pendiente
create policy "reservas_cancelar_propia" on public.reservas
  for update using (auth.uid() = solicitante_id);

-- NOTA IMPORTANTE: las políticas de "admin" (aprobar accesos, rechazar reservas,
-- gestionar inventario y eventos fijos) se controlan desde el backend con la
-- service_role key, que se usa SOLO en las funciones serverless (nunca en el navegador).

-- =====================================================
-- 7. DATOS INICIALES DE EJEMPLO (inventario típico de un estudio)
-- =====================================================
insert into public.inventario (nombre, cantidad_disponible) values
  ('Micrófono condensador', 2),
  ('Micrófono dinámico', 3),
  ('Audífonos de monitoreo', 4),
  ('Cable XLR', 8),
  ('Computador del estudio', 1),
  ('Cámara de video', 1),
  ('Trípode', 2),
  ('Luz de estudio', 3),
  ('Atril', 2),
  ('Silla adicional', 4);

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
