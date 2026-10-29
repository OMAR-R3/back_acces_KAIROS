import { supabase } from "../db/supabaseClient.js";

const TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/;
const TIMEOUT_MS = 5000;

// Best effort: un fallo push nunca debe afectar el estado guardado.
export const sendVisitStatusPush = async ({ id, visitante_id, estado }) => {
    if (!["aprobada", "cancelada"].includes(estado)) return;

    const controller = new AbortController();
    let timer;
    let stage = "consulta de tokens";
    const operation = async () => {
        const { data, error } = await supabase
            .from("Dispositivos_Push")
            .select("token")
            .eq("visitante_id", visitante_id)
            .abortSignal(controller.signal);
        if (error) throw new Error("token_query_failed");
        if (controller.signal.aborted) return;
        const tokens = [...new Set((data || []).map(row => row.token)
            .filter(token => typeof token === "string" && TOKEN_REGEX.test(token)))];
        // Mismo folio que los endpoints de visitas de la app.
        const folio = "KV-" + String(id).padStart(6, "0");
        stage = "envío a Expo";
        for (let offset = 0; offset < tokens.length; offset += 100) {
            if (controller.signal.aborted) return;
            const batch = tokens.slice(offset, offset + 100);
            const response = await fetch("https://exp.host/--/api/v2/push/send", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                signal: controller.signal,
                body: JSON.stringify(batch.map(to => ({
                    to,
                    title: estado === "aprobada" ? "Visita aprobada" : "Visita cancelada",
                    body: estado === "aprobada"
                        ? `Tu visita ${folio} fue aprobada. Consulta los detalles en Mis visitas.`
                        : `Tu visita ${folio} fue cancelada. Revisa los detalles en Mis visitas.`,
                    data: { visita_id: id },
                }))),
            });
            if (!response.ok) throw new Error("expo_http_failed");
            const result = await response.json();
            if (result.errors?.length || !Array.isArray(result.data)
                || result.data.length !== batch.length) {
                throw new Error("expo_invalid_response");
            }
            const failed = result.data.filter(ticket => ticket?.status !== "ok").length;
            if (failed) console.error("Push: Expo rechazó notificaciones", { visita_id: id, cantidad: failed });
        }
    };

    try {
        await Promise.race([
            operation(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new Error("push_timeout"));
                }, TIMEOUT_MS);
            }),
        ]);
    } catch {
        // No registrar mensajes externos: pueden contener tokens o datos personales.
        console.error("Push: no se pudo completar la notificación", {
            visita_id: id, etapa: stage, timeout: controller.signal.aborted,
        });
    } finally {
        clearTimeout(timer);
    }
};
