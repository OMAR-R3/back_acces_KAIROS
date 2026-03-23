import { supabase } from "@/db/supabaseClient";

/* =========================
   GET - Todos los departamentos
========================= */
export async function getDepartamentos() {
    const { data, error } = await supabase
        .from("Departamentos")
        .select("*")
        .order("nombre", { ascending: true });

    if (error) throw error;
    return data;
}

/* =========================
   POST - Crear departamento
========================= */
export async function createDepartamento(departamento) {
    console.log("Intentando crear departamento:", departamento);

    const { data, error } = await supabase
        .from("Departamentos")
        .insert(departamento)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/* =========================
   PUT - Actualizar departamento
========================= */
export async function updateDepartamento(id, departamento) {
    const { id: _, ...dataToUpdate } = departamento;

    const { data, error } = await supabase
        .from("Departamentos")
        .update(dataToUpdate)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/* =========================
   DELETE - Eliminar departamento
========================= */
export async function deleteDepartamento(id) {
    const { data, error } = await supabase
        .from("Departamentos")
        .delete()
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}