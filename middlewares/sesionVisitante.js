export async function verificarSesionVisitante(payload) {
    if (!payload?.jti) return payload;

    let revocada;
    try {
        const { sesionRevocada } = await import("@/services/sesionVisitanteService");
        revocada = await sesionRevocada(payload.jti);
    } catch {
        const error = new Error("No se pudo validar la sesión");
        error.status = 503;
        throw error;
    }

    if (revocada) {
        const error = new Error("Sesión cerrada");
        error.status = 401;
        throw error;
    }
    return payload;
}