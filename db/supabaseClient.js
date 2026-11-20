import { createClient } from "@supabase/supabase-js";

let supabase;

export function getSupabaseClient() {
    if (supabase) return supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) throw new Error("SUPABASE_URL es obligatoria para usar Supabase");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY es obligatoria para usar Supabase");

    supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false
        }
    });
    return supabase;
}
