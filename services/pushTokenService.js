import { supabase } from "@/db/supabaseClient";

// Registra el token push de un dispositivo del visitante.
// Si el token ya existía (por ejemplo, otra cuenta inició sesión en el mismo
// teléfono), se reasigna al visitante actual en lugar de duplicarlo.
export const upsertPushToken = async ({ visitante_id, token, plataforma }) => {
    const { error } = await supabase
        .from("Dispositivos_Push")
        .upsert(
            {
                visitante_id: Number(visitante_id),
                token,
                plataforma,
                updated_at: new Date().toISOString()
            },
            { onConflict: "token" }
        );

    if (error) throw new Error(error.message);
};

// Borra el token solo si pertenece al visitante. No falla si no existe.
export const deletePushToken = async ({ visitante_id, token }) => {
    const { error } = await supabase
        .from("Dispositivos_Push")
        .delete()
        .eq("token", token)
        .eq("visitante_id", Number(visitante_id));

    if (error) throw new Error(error.message);
};