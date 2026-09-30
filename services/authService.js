import bcrypt from "bcryptjs";
import { supabase } from "@/db/supabaseClient";
import { signToken } from "@/utils/jwt";

import {
    getVisitanteByCorreo,
    createVisitante,
    updateVisitante,
} from "@/services/visitorService";

export async function loginUsuario({ nombre_usuario, password }, dispositivo = "") {
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
        rol: usuario.rol,
        dispositivo  // ← agregar al payload del JWT
    });

    // Nunca devolver la contraseña
    const { password: _, ...usuarioSinPassword } = usuario;
    return { token, usuario: { ...usuarioSinPassword, dispositivo } };
}

/* =========================
   Hash de contraseña — para crear/actualizar usuarios
========================= */
export async function hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, 12);
}

/* =========================
   Login de visitante (app)
========================= */
export async function loginVisitante({ correo, password }, dispositivo = "") {
    if (!correo || !password) {
        const error = new Error("Correo y contraseña son requeridos");
        error.status = 400;
        throw error;
    }

    const correoNormalizado = correo.trim().toLowerCase();
    const visitante = await getVisitanteByCorreo(correoNormalizado);

    // !visitante.password cubre las filas creadas por una visita anónima,
    // que traen password = '' por default hasta que la persona se registra
    if (!visitante || !visitante.password) {
        const error = new Error("Credenciales incorrectas");
        error.status = 401;
        throw error;
    }

    const passwordValida = await bcrypt.compare(password, visitante.password);
    if (!passwordValida) {
        const error = new Error("Credenciales incorrectas");
        error.status = 401;
        throw error;
    }

    const token = signToken({
        id: visitante.id,
        rol: "visitante",
        correo: visitante.correo,
        dispositivo,
    });

    const { password: _, ...visitanteSinPassword } = visitante;
    return { token, visitante: { ...visitanteSinPassword, dispositivo } };
}

/* =========================
   Registro de visitante (app)
   Si ya existía una fila en Visitantes por una visita anterior sin cuenta
   (password vacío), se completa esa fila en vez de crear una duplicada.
========================= */
export async function registerVisitante({
    nombre, apellido_paterno, apellido_materno, correo, telefono, password,
}) {
    if (!nombre || !apellido_paterno || !apellido_materno || !correo || !telefono || !password) {
        const error = new Error("Todos los campos son requeridos");
        error.status = 400;
        throw error;
    }

    const correoNormalizado = correo.trim().toLowerCase();
    const existente = await getVisitanteByCorreo(correoNormalizado);
    const passwordHash = await hashPassword(password);

    if (existente) {
        if (existente.password) {
            const error = new Error("Ya existe una cuenta con ese correo");
            error.status = 409;
            throw error;
        }
        return await updateVisitante(existente.id, { password: passwordHash });
    }

    return await createVisitante({
        nombre,
        apellido_paterno,
        apellido_materno,
        correo: correoNormalizado,
        telefono,
        password: passwordHash,
    });
}