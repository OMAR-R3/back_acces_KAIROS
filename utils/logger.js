export function log(endpoint, status, message = "") {
    const time = new Date().toISOString();
    console.log(`[${time}] [${status.toUpperCase()}] ${endpoint} ${message}`);
}
