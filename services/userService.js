import { supabase } from "../db/supabaseClient.js";

/*export async function getUsuarios() {
    const { data, error } = await supabase
        .from("Usuarios_Internos")
        .select("*");

    if (error) throw error;
    return data;
}*/
/*export async function getUsuarios(filters = {}) {
    const { q, rol, page = 1, limit = 10 } = filters;

    // 1. Consulta base con conteo exacto para la paginación
    let query = supabase
        .from("Usuarios_Internos")
        .select("*", { count: "exact" });

    // 2. Búsqueda Simple (Punto 5.2 de la práctica)
    // Buscamos coincidencia en nombre O apellido paterno O apellido materno
    if (q) {
        query = query.or(
            `nombre.ilike.%${q}%,apellido_paterno.ilike.%${q}%,apellido_materno.ilike.%${q}%`
        );
    }

    // 3. Búsqueda Avanzada / Filtros (Punto 5.3)
    if (rol) {
        query = query.eq("rol", rol);
    }

    // 4. Paginación (Punto 5.4)
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
        .range(from, to)
        .order("created_at", { ascending: false }); // Los más recientes primero

    if (error) throw error;

    return {
        usuarios: data,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / limit)
    };
}
*/

export async function getUsuarios(filters = {}) {
    const { q, rol, page = 1, limit = 10 } = filters;

    let query = supabase
        .from("Usuarios_Internos")
        .select("*", { count: "exact" });

    if (rol && rol.trim() !== "") {
        // OJO: En Supabase tu columna sí se llama "rol", 
        // así que el filtro queda: columna "rol" igual a la variable role
        query = query.eq("rol", rol);
    }

    if (q && q.trim() !== "") {
        query = query.or(`nombre.ilike.%${q}%,apellido_paterno.ilike.%${q}%,apellido_materno.ilike.%${q}%`);
    }

    // Paginación y orden...
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
        .range(from, to)
        .order("created_at", { ascending: false });

    if (error) throw error;

    return { usuarios: data, total: count, page: Number(page), limit: Number(limit), totalPages: Math.ceil(count / limit) };
}

export async function createUsuario(usuario) {
    const { data, error } = await supabase
        .from("Usuarios_Internos")
        .insert(usuario)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateUsuario(id, usuario) {
    const { data, error } = await supabase
        .from("Usuarios_Internos")
        .update(usuario)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteUsuario(id) {
    const { data, error } = await supabase
        .from("Usuarios_Internos")
        .delete()
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}
