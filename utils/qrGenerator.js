import QRCode from "qrcode";

export const generateQR = async (visitId) => {
    try {
        const secret = process.env.QR_SECRET;

        if (!secret) {
            throw new Error("QR_SECRET no está definido");
        }

        // Payload seguro
        const payload = `VISIT:${visitId}:${secret}`;

        return await QRCode.toDataURL(payload, {
            errorCorrectionLevel: "H",
            type: "image/png",
            margin: 2,
            width: 300
        });

    } catch (error) {
        throw new Error("Error generando QR");
    }
};