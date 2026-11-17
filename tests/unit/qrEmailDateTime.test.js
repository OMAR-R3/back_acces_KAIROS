import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { formatQRFecha, formatQRHora } from "../../utils/qrEmailDateTime.js";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({
    default: { createTransport: () => ({ sendMail }) },
}));
import { sendApprovalEmail, sendCancellationEmail, resendQREmail } from "../../services/emailService.js";

const cases = [
    ["2026-11-17", "10:30:00", "10:30 a. m.", "martes, 17 de noviembre de 2026"],
    ["2026-12-31", "23:45:00", "11:45 p. m.", "jueves, 31 de diciembre de 2026"],
    ["2027-01-01", "00:15:00", "12:15 a. m.", "viernes, 1 de enero de 2027"],
    ["2028-02-29", "10:30", "10:30 a. m.", "martes, 29 de febrero de 2028"],
];

describe("QR email local calendar contract (independent of process TZ)", () => {
    beforeEach(() => vi.clearAllMocks());

    it.each(cases)("preserves %s %s", (date, time, expectedTime, expectedDate) => {
        expect(formatQRFecha(date)).toBe(expectedDate);
        expect(formatQRHora(time)).toBe(expectedTime);
    });

    it("preserves the calendar prefix like the mobile API, without treating it as an instant", () => {
        expect(formatQRFecha("2027-01-01T00:00:00Z")).toBe("viernes, 1 de enero de 2027");
        expect(formatQRHora(undefined)).toBe("");
    });

    it.each(["UTC", "America/Mexico_City", "Asia/Tokyo"])("preserves all values in a process started with TZ=%s", (tz) => {
        const moduleURL = new URL("../../utils/qrEmailDateTime.js", import.meta.url).href;
        const script = `import { formatQRFecha, formatQRHora } from ${JSON.stringify(moduleURL)};
            const cases = ${JSON.stringify(cases)};
            console.log(JSON.stringify(cases.map(([date, time]) => [formatQRFecha(date), formatQRHora(time)])));`;
        const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
            env: { ...process.env, TZ: tz }, encoding: "utf8",
        });
        expect(JSON.parse(output)).toEqual(cases.map(([, , time, date]) => [date, time]));
    });

    it.each(cases)("renders the original cancellation date %s and time %s", async (date, time, expectedTime, expectedDate) => {
        await sendCancellationEmail({
            email: "test@example.com", name: "Visitante", date, time, motivo: "Cambio de agenda",
        });
        expect(sendMail).toHaveBeenCalledOnce();
        const mail = sendMail.mock.calls[0][0];
        expect(mail.html).toContain(`<strong>Fecha:</strong> ${expectedDate}`);
        expect(mail.html).toContain(`<strong>Hora:</strong> ${expectedTime}`);
        expect(mail.html).toContain("<strong>Motivo:</strong> Cambio de agenda");
    });

    for (const send of [sendApprovalEmail, resendQREmail]) {
        it.each(cases)(`${send.name} renders %s %s and retains the QR attachment`, async (date, time, expectedTime, expectedDate) => {
            await send({ email: "test@example.com", name: "Visitante", date, time, qrBase64: "data:image/png;base64,cXI=" });
            expect(sendMail).toHaveBeenCalledOnce();
            const mail = sendMail.mock.calls[0][0];
            expect(mail.html).toContain(`<strong>Fecha:</strong> ${expectedDate}`);
            expect(mail.html).toContain(`<strong>Hora:</strong> ${expectedTime}`);
            expect(mail.attachments).toEqual([{ filename: "qr.png", content: "cXI=", encoding: "base64", cid: "qrcode" }]);
        });
    }
});
