// Configuración del cliente Supabase
// La anon key es segura de usar en el navegador: el acceso real está controlado
// por las políticas de seguridad (RLS) configuradas en la base de datos.

const SUPABASE_URL = 'https://fntengduhqbymljsabjb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudGVuZ2R1aHFieW1sanNhYmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NTgzOTcsImV4cCI6MjA5NzIzNDM5N30.mbLkwoFpBjJWKXb7iCrOpBPizkBY1WpjpokSRCv3aHk';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
