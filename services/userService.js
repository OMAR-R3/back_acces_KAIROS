import { supabase } from "@/db/supabaseClient";

/* =========================
   GET - Lista con filtros y paginación
   ?q=&rol=&page=&limit=
========================= */
export async function getUsuarios(filters = {}) {
    const { q, rol, page = 1, limit = 10 } = filters;

    let query = supabase
        .from("Usuarios_Internos")
        .select("id, nombre, apellido_paterno, apellido_materno, rol, created_at", { count: "exact" });
    if (rol?.trim()) {
        query = query.eq("rol", rol);
    }

    if (q?.trim()) {
        query = query.or(
            `nombre.ilike.%${q}%,apellido_paterno.ilike.%${q}%,apellido_materno.ilike.%${q}%`
        );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
        .range(from, to)
        .order("created_at", { ascending: false });

    if (error) throw error;

    return {
        usuarios: data,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / limit)
    };
}

/* =========================
   POST - Crear usuario interno
========================= */
import bcrypt from "bcryptjs";

export async function createUsuario(usuario) {
    // Hashear password antes de guardar
    if (usuario.password) {
        usuario.password = await bcrypt.hash(usuario.password, 12);
    }

    const { data, error } = await supabase
        .from("Usuarios_Internos")
        .insert(usuario)
        .select("id, nombre, apellido_paterno, apellido_materno, rol, created_at")
        .single();

    if (error) throw error;
    return data;
}
/* =========================
   PUT - Actualizar usuario interno
========================= */
export async function updateUsuario(id, usuario) {
    const { id: _, password, ...dataToUpdate } = usuario;

    // Si viene password nuevo, hashearlo
    if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 12);
    }

    const { data, error } = await supabase
        .from("Usuarios_Internos")
        .update(dataToUpdate)
        .eq("id", id)
        .select("id, nombre, apellido_paterno, apellido_materno, rol, created_at")
        .single();

    if (error) throw error;
    return data;
}

/* =========================
   DELETE - Eliminar usuario interno
========================= */
export async function deleteUsuario(id) {
    const { data, error } = await supabase
        .from("Usuarios_Internos")
        .delete()
        .eq("id", id)
        .select("id, nombre, apellido_paterno, apellido_materno, rol, created_at")
        .single();

    if (error) throw error;
    return data;
}