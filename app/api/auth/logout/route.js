export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST() {
    const response = NextResponse.json(
        { success: true, message: "Sesión cerrada" },
        { status: 200 }
    );

    // Borrar la cookie
    response.cookies.set("auth_token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0 // expira inmediatamente
    });

    return response;
}