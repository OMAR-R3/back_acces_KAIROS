import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/* =========================
   Helpers de formato
========================= */
function formatFecha(fechaISO) {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString("es-MX", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/Mexico_City"
    });
}

function formatHora(horaStr) {
    // horaStr viene como "10:00:00" desde la BD
    if (!horaStr) return "";
    const [hours, minutes] = horaStr.split(":");
    const fecha = new Date();
    fecha.setHours(Number(hours), Number(minutes));
    return fecha.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Mexico_City"
    });
}

/* =========================
   Aprobación — con QR
========================= */
export const sendApprovalEmail = async ({ email, name, date, time, qrBase64 }) => {
    if (!qrBase64) throw new Error("QR vacío al enviar correo de aprobación");

    await transporter.sendMail({
        from: `"Control de Acceso" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "✅ Tu visita fue aprobada — Código QR de acceso",
        html: `
            <h2>Hola ${name} 👋</h2>
            <p>Tu visita ha sido <strong>aprobada</strong>.</p>
            <p><strong>Fecha:</strong> ${formatFecha(date)}</p>
            <p><strong>Hora:</strong> ${formatHora(time)}</p>
            <p>Presenta este código QR en la entrada:</p>
            <img src="cid:qrcode" alt="Código QR" />
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

/* =========================
   Cancelación — con motivo
========================= */
export const sendCancellationEmail = async ({ email, name, date, time, motivo }) => {
    await transporter.sendMail({
        from: `"Control de Acceso" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "❌ Tu visita fue cancelada",
        html: `
            <h2>Hola ${name}</h2>
            <p>Lamentamos informarte que tu visita ha sido <strong>cancelada</strong>.</p>
            <p><strong>Fecha:</strong> ${formatFecha(date)}</p>
            <p><strong>Hora:</strong> ${formatHora(time)}</p>
            <p><strong>Motivo:</strong> ${motivo}</p>
            <br/>
            <p>Si tienes dudas, comunícate con nosotros.</p>
        `
    });
};

/* =========================
   Reenvío de QR
========================= */
export const resendQREmail = async ({ email, name, date, time, qrBase64 }) => {
    if (!qrBase64) throw new Error("QR vacío al reenviar correo");

    await transporter.sendMail({
        from: `"Control de Acceso" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "🔄 Tu código QR de acceso — Reenvío",
        html: `
            <h2>Hola ${name} 👋</h2>
            <p>Aquí está tu código QR de acceso.</p>
            <p><strong>Fecha:</strong> ${formatFecha(date)}</p>
            <p><strong>Hora:</strong> ${formatHora(time)}</p>
            <img src="cid:qrcode" alt="Código QR" />
            <br/>
            <p>Preséntalo en la entrada el día de tu visita.</p>
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