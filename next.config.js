/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: false,
    async headers() {
        return [
            {
                source: "/api/:path*",
                headers: [
                    {
                        key: "Access-Control-Allow-Origin",
                        value: "*"
                    },
                    {
                        key: "Access-Control-Allow-Methods",
                        value: "GET, POST, PUT, PATCH, DELETE, OPTIONS"
                    },
                    {
                        key: "Access-Control-Allow-Headers",
                        value: "Content-Type, x-api-key, ngrok-skip-browser-warning"
                    }
                ]
            }
        ];
    }
};

export default nextConfig;