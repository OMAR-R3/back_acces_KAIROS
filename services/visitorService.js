import { supabase } from "../db/supabaseClient.js";

/* =========================
   GET - Todos los visitantes
========================= */
export async function getVisitantes() {
    const { data, error } = await supabase
        .from("Visitantes")
        .select("*");

    if (error) throw error;
    return data;
}

/* =========================
   GET - Buscar visitante por correo
========================= */
export async function getVisitanteByCorreo(correo) {
    const { data, error } = await supabase
        .from("Visitantes")
        .select("*")
        .eq("correo", correo)
        .maybeSingle(); // No falla si no existe, regresa null

    if (error) throw error;
    return data; // null si no existe
}

/* =========================
   POST - Crear visitante
========================= */
export async function createVisitante(visitante) {
    const { data, error } = await supabase
        .from("Visitantes")
        .insert(visitante)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/* =========================
   PUT - Actualizar visitante
========================= */
export async function updateVisitante(id, visitante) {
    const { id: _, ...dataToUpdate } = visitante;

    const { data, error } = await supabase
        .from("Visitantes")
        .update(dataToUpdate)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/* =========================
   DELETE - Eliminar visitante
========================= */
export async function deleteVisitante(id) {
    const { data, error } = await supabase
        .from("Visitantes")
        .delete()
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}