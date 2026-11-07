import { createHash, timingSafeEqual } from "node:crypto";

const digest = value => createHash("sha256").update(value).digest();

// Independent of dashboard cookies, roles and JWTs.
export function checkCheckerAuth(req) {
    const expected = process.env.CHECKER_API_KEY;
    if (!expected || Buffer.byteLength(expected) < 32 || Buffer.byteLength(expected) > 512) {
        const error = new Error("Servicio no disponible");
        error.status = 503;
        throw error;
    }
    const supplied = req.headers.get("x-api-key") ?? "";
    if (Buffer.byteLength(supplied) > 512 || !timingSafeEqual(digest(supplied), digest(expected))) {
        const error = new Error("No autorizado");
        error.status = 401;
        throw error;
    }
}
