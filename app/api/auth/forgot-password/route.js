export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/db/supabaseClient";
import crypto from "crypto";

export async function POST(req) {
    try {
        const { correo } = await req.json();

        if (!correo) {
            return NextResponse.json(
                { error: "El correo es requerido" },
                { status: 400 }
            );
        }

        // Buscar usuario por correo — no revelar si existe o no por seguridad
        const { data: usuario } = await supabase
            .from("Usuarios_Internos")
            .select("id, nombre, correo")
            .eq("correo", correo.trim().toLowerCase())
            .maybeSingle();

        // Siempre responder igual aunque no exista el usuario
        // Esto evita enumerar usuarios válidos
        if (!usuario) {
            return NextResponse.json({
                success: true,
                message: "Si el correo existe, recibirás un enlace en breve"
            });
        }

        // Invalidar tokens anteriores del mismo usuario
        await supabase
            .from("reset_tokens")
            .update({ used: true })
            .eq("usuario_id", usuario.id)
            .eq("used", false);

        // Generar token único
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        // Guardar token en BD
        const { error: insertError } = await supabase
            .from("reset_tokens")
            .insert([{
                usuario_id: usuario.id,
                token,
                expires_at: expiresAt.toISOString(),
                used: false
            }]);

        if (insertError) throw insertError;

        // Enviar correo con el link
        const resetLink = `${process.env.INTRANET_URL}/reset-password?token=${token}`;

        const { sendResetPasswordEmail } = await import("@/services/emailService");
        await sendResetPasswordEmail({
            email: usuario.correo,
            nombre: usuario.nombre,
            link: resetLink
        });

        return NextResponse.json({
            success: true,
            message: "Si el correo existe, recibirás un enlace en breve"
        });

    } catch (error) {
        console.error("Error en forgot-password:", error.message);
        return NextResponse.json(
            { error: "Error procesando la solicitud" },
            { status: 500 }
        );
    }
}