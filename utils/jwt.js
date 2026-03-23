import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const EXPIRATION = "8h"; // sesión de 8 horas, ajusta según necesites

export function signToken(payload) {
    if (!SECRET) throw new Error("JWT_SECRET no está definido");
    return jwt.sign(payload, SECRET, { expiresIn: EXPIRATION });
}

export function verifyToken(token) {
    if (!SECRET) throw new Error("JWT_SECRET no está definido");
    return jwt.verify(token, SECRET); // lanza error si expiró o es inválido
}