// Módulo de autenticación

const Auth = {

  async registrar(nombreCompleto, correo, tipoUsuario, password) {
    const correoNormalizado = correo.trim().toLowerCase();

    if (!correoNormalizado.endsWith(APP_CONFIG.DOMINIO_PERMITIDO)) {
      throw new Error(`Solo se aceptan correos institucionales ${APP_CONFIG.DOMINIO_PERMITIDO}`);
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email: correoNormalizado,
      password: password,
      options: {
        data: {
          nombre_completo: nombreCompleto.trim(),
          tipo_usuario: tipoUsuario
        }
      }
    });

    if (error) throw error;
    return data;
  },

  async iniciarSesion(correo, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: correo.trim().toLowerCase(),
      password: password
    });

    if (error) throw error;

    const perfil = await this.obtenerPerfilActual();

    if (perfil && perfil.estado !== 'aprobado') {
      await this.cerrarSesion();
      throw new Error('Tu cuenta aún no ha sido aprobada por el administrador del estudio.');
    }

    return { usuario: data.user, perfil };
  },

  async cerrarSesion() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  },

  async obtenerSesionActual() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  },

  async obtenerPerfilActual() {
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData.user) return null;

    const { data: perfil, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .single();

    if (error) {
      console.error('Error al obtener perfil:', error);
      return null;
    }
    return perfil;
  }
};
