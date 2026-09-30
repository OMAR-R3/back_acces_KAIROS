const buckets = new Map();

// Limpieza periódica para que buckets viejos no queden ocupando memoria
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (now - bucket.start > bucket.windowMs) buckets.delete(key);
    }
}, 10 * 60 * 1000);

/**
 * Lanza un error 429 si se supera el máximo de intentos en la ventana de tiempo.
 * @param {Request} req
 * @param {{ windowMs?: number, max?: number, keySuffix: string }} options
 *   keySuffix identifica QUÉ se está limitando (ej. "login", o "login:correo@x.com")
 */
export function checkRateLimit(req, { windowMs = 15 * 60 * 1000, max = 5, keySuffix }) {
    const ip = getClientIp(req);
    const key = `${ip}:${keySuffix}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
        bucket = { start: now, count: 0, windowMs };
        buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > max) {
        const error = new Error("Demasiados intentos, intenta de nuevo más tarde");
        error.status = 429;
        throw error;
    }
}

function getClientIp(req) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return "unknown"; // si esto se repite mucho, revisar la config de nginx
}