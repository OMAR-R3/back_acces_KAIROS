import QRCode from "qrcode";
import crypto from "crypto";

// Genera un token único para la visita
export const generateQRToken = () => {
    return crypto.randomUUID(); // token único e impredecible
};

// Genera la imagen QR a partir del token
export const generateQR = async (token) => {
    try {
        if (!token) throw new Error("Token requerido para generar QR");

        return await QRCode.toDataURL(token, {
            errorCorrectionLevel: "H",
            type: "image/png",
            margin: 2,
            width: 300
        });

    } catch (error) {
        throw new Error("Error generando QR: " + error.message);
    }
};