// Visitas.fecha and hora_inicio are local calendar values for Mexico City,
// not UTC instants. Match the extranet/mobile contract without converting them.
export function formatQRFecha(fecha) {
    const [year, month, day] = fecha.slice(0, 10).split("-").map(Number);
    // UTC is only a stable carrier for calendar formatting, not a timezone shift.
    return new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatQRHora(hora) {
    if (!hora) return "";
    const [hours, minutes] = hora.split(":");
    const hour = Number(hours);
    return `${String(hour % 12 || 12).padStart(2, "0")}:${minutes} ${hour < 12 ? "a. m." : "p. m."}`;
}
