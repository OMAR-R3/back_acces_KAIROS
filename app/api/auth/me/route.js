export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth } from "@/middlewares/auth";
import { supabase } from "@/db/supabaseClient";

/*
  GET /api/auth/me
  El dashboard llama esto al cargar para saber quién está logueado
*/
export async function GET(req) {
    try {
        const payload = checkAuth(req);

        // Traer datos frescos de la BD por si cambió algo
        const { data: usuario, error } = await supabase
            .from("Usuarios_Internos")
            .select("id, nombre, apellido_paterno, apellido_materno, rol")
            .eq("id", payload.id)
            .single();

        if (error || !usuario) {
            const err = new Error("Usuario no encontrado");
            err.status = 404;
            throw err;
        }

        return NextResponse.json({ success: true, data: usuario });

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}