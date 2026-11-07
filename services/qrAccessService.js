import { supabase } from "../db/supabaseClient.js";

const results = new Set(["valido", "expirado", "utilizado", "invalido"]);

export async function consumeVisitQR(token) {
    const { data, error } = await supabase.rpc("validate_and_consume_visit_qr", { p_token: token });
    if (error || !results.has(data)) throw new Error("QR service unavailable");
    return data;
}
