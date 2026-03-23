import { supabase } from "@/db/supabaseClient";

/* =========================
   POST - Crear log
========================= */
export async function createLog(usuario_id, accion) {
    const { data, error } = await supabase
        .from("Logs_Acceso")
        .insert([{
            usuario_id,
            accion,
            fecha: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/* =========================
   GET - Obtener logs
   Si se pasa usuario_id filtra por ese usuario
========================= */
export async function getLogs(usuario_id = null) {
    let query = supabase
        .from("Logs_Acceso")
        .select(`
            *,
            Usuarios_Internos (
                nombre,
                apellido_paterno
            )
        `)
        .order("fecha", { ascending: false });

    if (usuario_id) {
        query = query.eq("usuario_id", usuario_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/* =========================
   DELETE - Eliminar log por id
========================= */
export async function deleteLog(id) {
    const { data, error } = await supabase
        .from("Logs_Acceso")
        .delete()
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}