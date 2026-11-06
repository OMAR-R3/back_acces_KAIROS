// Missing configuration preserves the existing consumers. This is NOT secure mode.
export function lookupMode() {
    const mode = process.env.LOOKUP_ACCESS_MODE ?? "legacy";
    if (!["legacy", "prepare", "enforced"].includes(mode)) throw new Error("Invalid lookup mode");
    return mode;
}

export const lookupHeaders = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
};

export function normalizeLookupCorreo(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validLookupCorreo(correo) {
    if (!correo || correo.length > 254) return false;
    const parts = correo.split("@");
    if (parts.length !== 2) return false;
    const [local, domain] = parts;
    if (!local || local.length > 64 || !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/i.test(local)) return false;
    if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
    const labels = domain.split(".");
    return labels.length >= 2 && labels.every(label =>
        label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
    );
}
