import { verifyToken } from "@/utils/jwt";

/* =========================
   checkAuth — verifica JWT en cookie
   Lanza error si no hay sesión válida
========================= */
export function checkAuth(req) {
    if (req.method === "OPTIONS") return;

    const token = getTokenFromRequest(req);

    if (!token) {
        const error = new Error("No autenticado");
        error.status = 401;
        throw error;
    }

    try {
        const payload = verifyToken(token);
        return payload; // { id, nombre, rol }
    } catch {
        const error = new Error("Sesión inválida o expirada");
        error.status = 401;
        throw error;
    }
}

/* =========================
   checkRole — verifica que el usuario tenga el rol requerido
   Uso: checkRole(req, ["administrador", "recepcionista"])
========================= */
export function checkRole(req, rolesPermitidos = []) {
    const payload = checkAuth(req);

    if (!rolesPermitidos.includes(payload.rol)) {
        const error = new Error("No tienes permisos para esta acción");
        error.status = 403;
        throw error;
    }

    return payload; // retorna el payload para usarlo en la ruta
}

/* =========================
   Helper interno — extrae token de cookie o header
========================= */
function getTokenFromRequest(req) {
    // Primero buscar en cookie (dashboard admin)
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
        const cookies = Object.fromEntries(
            cookieHeader.split(";").map(c => {
                const [key, ...val] = c.trim().split("=");
                return [key, val.join("=")];
            })
        );
        if (cookies["auth_token"]) return cookies["auth_token"];
    }

    // Fallback: Bearer token en header Authorization
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7);
    }

    return null;
}