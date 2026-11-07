export const VENTANA_MINUTOS = 30;
export const ZONA_QR = "America/Mexico_City";
const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_QR, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function localParts(instant) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    return [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second].map(Number);
}

// Convert a wall-clock appointment using IANA rules, independent of host TZ.
// Keep seconds (and millisecond precision) instead of silently rounding minutes.
function appointmentInstant(fecha, horaInicio) {
    if (typeof fecha !== "string" || typeof horaInicio !== "string") return null;
    // Legacy callers used the textual calendar day even when fecha contained
    // an ISO timestamp. Preserve that contract; never shift this day via UTC.
    const dateMatch = /^(\d{4}-\d{2}-\d{2})(?:[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/.exec(fecha);
    if (!dateMatch) return null;
    const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/.exec(horaInicio);
    if (!match) return null;
    const [year, month, day] = dateMatch[1].split("-").map(Number);
    const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3] ?? 0);
    if (year < 1000 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);
    const check = new Date(wall);
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    let instant = wall;
    for (let i = 0; i < 4; i++) {
        const p = localParts(instant);
        const represented = Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]);
        const delta = wall - represented;
        if (delta === 0) return instant + Number((match[4] ?? "").padEnd(3, "0").slice(0, 3));
        instant += delta;
    }
    return null; // Nonexistent local time (e.g. historical DST transition).
}

export const calcularVentanaQR = (fecha, horaInicio) => {
    const inicio = appointmentInstant(fecha, horaInicio);
    if (inicio === null) return null;
    const ms = VENTANA_MINUTOS * 60 * 1000;
    return {
        desde: new Date(inicio - ms),
        hasta: new Date(inicio + ms),
    };
};

// "antes" | "vigente" | "expirado"
export const estadoVentana = (ventana, ahora = new Date()) => {
    if (ahora < ventana.desde) return "antes";
    if (ahora > ventana.hasta) return "expirado";
    return "vigente";
};
