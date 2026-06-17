# Estudio de Grabación — Universidad del Magdalena

Aplicación web para consultar el horario del estudio de grabación y gestionar solicitudes de reserva del espacio.

## ¿Qué incluye?

- Consulta del horario semanal (clases, bloqueos y reservas).
- Registro con correo institucional (@unimagdalena.edu.co) y aprobación de acceso por el administrador.
- Formulario de solicitud de reserva (2 horas, hasta 24h de anticipación, con participantes, elementos y disclaimer).
- Aprobación automática de reservas si el horario está libre.
- Panel de administración: aprobar/rechazar accesos, gestionar reservas, clases/bloqueos e inventario.
- Notificaciones por correo al aprobar o rechazar (opcional, vía Resend).
- Código QR de acceso rápido generado dentro de la misma app.

## Estructura del proyecto

```
/public          → Frontend (HTML, CSS, JS) — esto es lo que ve el usuario
/api             → Funciones serverless (backend) que corren en Vercel
/database        → Scripts SQL para Supabase
```

## Pasos de despliegue

### 1. Base de datos (Supabase) — YA HECHO
Ya ejecutaste `database/schema.sql` en el SQL Editor de Supabase. Las tablas y el inventario inicial ya existen.

### 2. Subir el código a GitHub
1. Crea un repositorio nuevo en https://github.com/new (puede ser privado).
2. Sube todos los archivos de este proyecto a ese repositorio.

### 3. Desplegar en Vercel
1. Ve a https://vercel.com/new
2. Selecciona "Import" sobre el repositorio que acabas de crear.
3. Antes de darle "Deploy", configura las variables de entorno (sección **Environment Variables**):
   - `SUPABASE_URL` → `https://fntengduhqbymljsabjb.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` → la encuentras en Supabase: Project Settings → API → "service_role" (clic en el ojo para revelarla). **Esta clave es secreta, nunca la compartas ni la subas a GitHub.**
   - (Opcional) `RESEND_API_KEY` y `EMAIL_REMITENTE` si quieres que se envíen correos automáticos.
4. Click en "Deploy". En 1-2 minutos tendrás una URL pública, por ejemplo:
   `https://estudio-grabacion-unimagdalena.vercel.app`

### 4. Crear tu usuario administrador
1. Entra a la URL pública de tu app.
2. Regístrate normalmente desde la pestaña "Registrarse" con tu correo institucional.
3. En Supabase, ve a SQL Editor y ejecuta el script `database/crear_admin.sql`, reemplazando el correo de ejemplo por el tuyo.
4. Vuelve a la app e inicia sesión: ya deberías ver la pestaña "Administrar".

### 5. Generar el código QR para los billboards
1. Inicia sesión en la app (como cualquier usuario).
2. Haz clic en el ícono de QR en la barra superior.
3. Captura de pantalla o descarga el código y mándalo a imprimir.

## Mantenimiento

- **Aprobar nuevos usuarios:** Panel Administrar → Usuarios y accesos.
- **Agregar clases o bloquear el estudio:** Panel Administrar → Clases / bloqueos.
- **Agregar o quitar elementos del inventario:** Panel Administrar → Inventario.
- **Revisar o rechazar reservas:** Panel Administrar → Reservas.

## Notas de seguridad

- La `anon key` de Supabase es segura de usar en el navegador (ya está en el código del frontend).
- La `service_role key` es secreta: solo debe configurarse como variable de entorno en Vercel, nunca en el código del frontend ni en GitHub.
- El acceso a registrarse está restringido a correos `@unimagdalena.edu.co` (validado tanto en el frontend como recomendado reforzar en Supabase Auth si lo deseas).
