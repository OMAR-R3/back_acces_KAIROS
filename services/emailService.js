import nodemailer from "nodemailer";

// 🔹 Crear transporter UNA sola vez
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

export const sendVisitEmail = async ({
    email,
    name,
    date,
    qrBase64,
}) => {

    if (!qrBase64) {
        throw new Error("QR vacío al enviar correo");
    }

    await transporter.sendMail({
        from: `"Control de Acceso" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Tu código QR de acceso",
        html: `
          <h2>Hola ${name} 👋</h2>
          <p>Tu visita está registrada para la fecha:</p>
          <h3>${date}</h3>
          <p>Presenta este código QR en la entrada:</p>
          <img src="cid:qrcode" />
          <br/>
          <p>Gracias por tu registro.</p>
        `,
        attachments: [
            {
                filename: "qr.png",
                content: qrBase64.split("base64,")[1],
                encoding: "base64",
                cid: "qrcode"
            }
        ]
    });
};

export const sendVisitUpdateEmail = async ({
    email,
    name,
    date,
    changes,
    qrBase64,
}) => {

    const changesHTML = changes
        .map(
            (c) =>
                `<li><strong>${c.field}</strong>: ${c.oldValue} → ${c.newValue}</li>`
        )
        .join("");

    // 🔹 Quitar el encabezado "data:image/png;base64,"
    const base64Data = qrBase64.split("base64,")[1];

    await transporter.sendMail({
        from: `"Control de Acceso" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Tu visita ha sido modificada",
        html: `
            <h2>Hola ${name} 👋</h2>
            <p>Tu visita fue actualizada.</p>
            <p><strong>Nueva fecha:</strong> ${date}</p>

            <h3>Cambios realizados:</h3>
            <ul>
                ${changesHTML}
            </ul>

            <p>Este es tu nuevo código QR:</p>
            <img src="cid:qrimage" />

            <p>Por favor usa este nuevo código.</p>
        `,
        attachments: [
            {
                filename: "qr.png",
                content: base64Data,
                encoding: "base64",
                cid: "qrimage", // 👈 mismo nombre que en src
            },
        ],
    });
};