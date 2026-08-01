import { NextRequest, NextResponse } from "next/server";

const isProd = process.env.NODE_ENV === "production";

const prodAllowedOrigins = [
    "https://kairos-intranet.duckdns.org",
];

function isOriginAllowed(origin: string): boolean {
    if (!origin) return false;

    if (!isProd) {
        return (
            /^http:\/\/localhost:\d+$/.test(origin) ||
            /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
            origin.endsWith(".ngrok-free.dev") ||
            origin.endsWith(".ngrok.io")
        );
    }

    return prodAllowedOrigins.includes(origin);
}

export function middleware(request: NextRequest) {
    const origin = request.headers.get("origin") ?? "";
    const allowed = isOriginAllowed(origin);

    const corsHeaders = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key, ngrok-skip-browser-warning, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": allowed ? origin : "",
    };

    if (request.method === "OPTIONS") {
        return new NextResponse(null, {
            status: 204,
            headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
        });
    }

    const response = NextResponse.next();

    if (allowed) {
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
    }

    return response;
}

export const config = {
    matcher: "/api/:path*",
};