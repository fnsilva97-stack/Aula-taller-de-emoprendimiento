-- =====================================================
-- PROMOVER UN USUARIO A ADMINISTRADOR
-- =====================================================
-- PASO PREVIO: el usuario debe registrarse primero normalmente
-- desde la página web (pestaña "Registrarse"), con su correo institucional.
-- Después de registrarse, ejecuta este script reemplazando el correo
-- por el correo real que usó para registrarse.

update public.profiles
set tipo_usuario = 'admin',
    estado = 'aprobado',
    puede_reservar = true
where correo = 'REEMPLAZA_CON_TU_CORREO@unimagdalena.edu.co';

-- Verifica que el cambio se aplicó correctamente:
select id, nombre_completo, correo, tipo_usuario, estado, puede_reservar
from public.profiles
where correo = 'REEMPLAZA_CON_TU_CORREO@unimagdalena.edu.co';
