import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { supabase } from "../db/supabaseClient.js";
import { sendLookupCodeEmail } from "./emailService.js";
import { normalizeLookupCorreo, validLookupCorreo } from "../utils/lookupPolicy.js";

const hash = value => createHash("sha256").update(value).digest("hex");
const secretToken = () => randomBytes(32).toString("base64url");
const tokenSyntax = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const uuidSyntax = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function keyedHash(value) {
    const secret = process.env.LOOKUP_CODE_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Lookup not configured");
    return createHmac("sha256", secret).update(value).digest("hex");
}

export async function requestLookupCode(correoValue, clientIp) {
    const correo = normalizeLookupCorreo(correoValue);
    if (!validLookupCorreo(correo)) throw new Error("Invalid lookup input");
    const challengeId = randomUUID();
    const browserSecret = secretToken();
    const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
    const { data, error } = await supabase.rpc("lookup_issue_challenge", {
        p_id: challengeId,
        p_correo: correo,
        p_browser_hash: hash(browserSecret),
        p_code_hash: keyedHash(`code:${challengeId}:${code}`),
        p_ip_hash: keyedHash(`ip:${clientIp}`),
    });
    if (error) throw new Error("Lookup storage unavailable");
    if (data === true) {
        try {
            // Send to every valid address, without checking Visitantes. Neither
            // response nor mail timing reveals whether the address has visits.
            await sendLookupCodeEmail({ email: correo, code });
        } catch {
            // Same public response on delivery failure. Never log email/code.
        }
    }
    // Suppressed sends return indistinguishable, unusable challenge credentials.
    return { challengeId, browserSecret };
}

export async function verifyLookupCode({ challengeId, browserSecret, code } = {}) {
    if (!uuidSyntax(challengeId) || !tokenSyntax(browserSecret) || typeof code !== "string" || !/^\d{8}$/.test(code)) return null;
    const accessToken = secretToken();
    // DB locks the challenge, increments attempts, consumes once and inserts the
    // session in ONE transaction. No check-then-update race in application code.
    const { data, error } = await supabase.rpc("lookup_verify_challenge", {
        p_id: challengeId,
        p_browser_hash: hash(browserSecret),
        p_code_hash: keyedHash(`code:${challengeId}:${code}`),
        p_session_hash: hash(accessToken),
    });
    if (error) throw new Error("Lookup storage unavailable");
    return data === true ? { accessToken, expiresIn: 900 } : null;
}

export async function authorizeLookup(req, correo) {
    // Deliberately separate from auth_token, JWTs, QR and general authentication.
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!tokenSyntax(token)) return false;
    const { data, error } = await supabase.rpc("lookup_authorize_session", {
        p_session_hash: hash(token), p_correo: correo,
    });
    if (error) throw new Error("Lookup storage unavailable");
    return data === true;
}

export async function revokeLookup(req) {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!tokenSyntax(token)) return;
    const { error } = await supabase.rpc("lookup_revoke_session", { p_session_hash: hash(token) });
    if (error) throw new Error("Lookup storage unavailable");
}
