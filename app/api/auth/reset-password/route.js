export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/db/supabaseClient";
import bcrypt from "bcryptjs";

export async function POST(req) {
    try {
        const { token, password } = await req.json();

        if (!token || !password) {
            return NextResponse.json(
                { error: "Token y contraseña son requeridos" },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "La contraseña debe tener al menos 6 caracteres" },
                { status: 400 }
            );
        }

        // Buscar token válido
        const { data: resetToken, error } = await supabase
            .from("reset_tokens")
            .select("*")
            .eq("token", token)
            .eq("used", false)
            .maybeSingle();

        if (error || !resetToken) {
            return NextResponse.json(
                { error: "Token inválido o ya utilizado" },
                { status: 400 }
            );
        }

        // Verificar que no haya expirado
        if (new Date() > new Date(resetToken.expires_at)) {
            return NextResponse.json(
                { error: "El enlace ha expirado. Solicita uno nuevo." },
                { status: 400 }
            );
        }

        // Hashear nueva contraseña
        const hashedPassword = await bcrypt.hash(password, 12);

        // Actualizar contraseña del usuario
        const { error: updateError } = await supabase
            .from("Usuarios_Internos")
            .update({ password: hashedPassword })
            .eq("id", resetToken.usuario_id);

        if (updateError) throw updateError;

        // Marcar token como usado
        await supabase
            .from("reset_tokens")
            .update({ used: true })
            .eq("id", resetToken.id);

        return NextResponse.json({
            success: true,
            message: "Contraseña actualizada correctamente"
        });

    } catch (error) {
        console.error("Error en reset-password:", error.message);
        return NextResponse.json(
            { error: "Error procesando la solicitud" },
            { status: 500 }
        );
    }
}