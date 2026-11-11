import { supabase } from "@/db/supabaseClient";

// Registra el jti de un JWT de visitante como cerrado. Es idempotente.
export const revocarSesion = async ({ jti, visitante_id, exp }) => {
    const { error } = await supabase
        .from("sesiones_revocadas")
        .upsert(
            {
                jti,
                visitante_id: Number(visitante_id),
                expira_en: new Date(exp * 1000).toISOString()
            },
            { onConflict: "jti", ignoreDuplicates: true }
        );

    if (error) throw new Error(error.message);
};

export const sesionRevocada = async jti => {
    const { data, error } = await supabase
        .from("sesiones_revocadas")
        .select("jti")
        .eq("jti", jti)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return Boolean(data);
};

// Borra las filas cuyo JWT ya venció; ya no hacen falta.
export const limpiarSesionesExpiradas = async () => {
    const { error } = await supabase
        .from("sesiones_revocadas")
        .delete()
        .lt("expira_en", new Date().toISOString());

    if (error) throw new Error(error.message);
};