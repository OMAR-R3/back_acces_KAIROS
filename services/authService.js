import bcrypt from "bcryptjs";
import { supabase } from "@/db/supabaseClient";
import { signToken } from "@/utils/jwt";

/* =========================
   Login — valida credenciales y devuelve token
========================= */
export async function loginUsuario({ nombre_usuario, password }) {
    if (!nombre_usuario || !password) {
        const error = new Error("Usuario y contraseña son requeridos");
        error.status = 400;
        throw error;
    }

    // Buscar usuario por nombre
    const { data: usuario, error: dbError } = await supabase
        .from("Usuarios_Internos")
        .select("id, nombre, apellido_paterno, rol, password")
        .eq("nombre", nombre_usuario.trim())
        .maybeSingle();

    if (dbError) throw dbError;

    if (!usuario) {
        const error = new Error("Credenciales incorrectas");
        error.status = 401;
        throw error;
    }

    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
        const error = new Error("Credenciales incorrectas");
        error.status = 401;
        throw error;
    }

    // Generar token con datos mínimos necesarios
    const token = signToken({
        id: usuario.id,
        nombre: `${usuario.nombre} ${usuario.apellido_paterno}`,
        rol: usuario.rol
    });

    // Nunca devolver la contraseña
    const { password: _, ...usuarioSinPassword } = usuario;

    return { token, usuario: usuarioSinPassword };
}

/* =========================
   Hash de contraseña — para crear/actualizar usuarios
========================= */
export async function hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, 12);
}