import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Explicit opt-in: NEVER use SUPABASE_URL or production credentials.
const database = process.env.LOOKUP_TEST_DATABASE_URL;
const execute = promisify(execFile);
const sql = async statement => {
    const { stdout } = await execute("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", statement]);
    return stdout.trim();
};

describe.skipIf(!database)("lookup PostgreSQL integration (requires disposable local lookup_test DB)", () => {
    it("refuses any database except local lookup_test", () => {
        const url = new URL(database);
        expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
        expect(url.pathname).toBe("/lookup_test");
    });

    // Repeat the guard before EVERY operation: a failed test must not leave the
    // remaining tests free to connect to a non-test database.
    const guard = () => {
        const url = new URL(database);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/lookup_test") {
            throw new Error("Only disposable local lookup_test is permitted");
        }
    };
    it("checks permissions, attempts, expiry, mailbox scope, revocation and shared quotas", async () => {
        guard();
        await execute("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
            "-f", fileURLToPath(new URL("./lookupAccess.sql", import.meta.url))]);
    }, 15000);

    it("consumes one challenge only once across two real concurrent connections", async () => {
        guard();
        const id = randomUUID();
        const correo = `race-${id}@example.com`;
        const a = id.replaceAll("-", "").repeat(2);
        const b = randomUUID().replaceAll("-", "").repeat(2);
        try {
            expect(await sql(`set role service_role; select public.lookup_issue_challenge('${id}', '${correo}', repeat('b',64), repeat('c',64), '${a}');`)).toBe("t");
            const results = await Promise.all([a, b].map(session => sql(
                `set role service_role; select public.lookup_verify_challenge('${id}', repeat('b',64), repeat('c',64), '${session}');`
            )));
            expect(results.sort()).toEqual(["f", "t"]);
            expect(await sql(`set role service_role; select count(*) from public.lookup_sessions where correo = '${correo}';`)).toBe("1");
        } finally {
            await sql(`set role service_role; delete from public.lookup_sessions where correo = '${correo}'; delete from public.lookup_challenges where id = '${id}';`);
        }
    }, 15000);

    it("keeps the shared mailbox quota under concurrent requests from different IPs", async () => {
        guard();
        const correo = `quota-race-${randomUUID()}@example.com`;
        try {
            const results = await Promise.all(Array.from({ length: 6 }, () => {
                const id = randomUUID();
                const ipHash = randomUUID().replaceAll("-", "").repeat(2);
                return sql(`set role service_role; select public.lookup_issue_challenge('${id}', '${correo}', repeat('b',64), repeat('c',64), '${ipHash}');`);
            }));
            expect(results.filter(value => value === "t")).toHaveLength(3);
            expect(results.filter(value => value === "f")).toHaveLength(3);
        } finally {
            await sql(`set role service_role; delete from public.lookup_challenges where correo = '${correo}';`);
        }
    }, 15000);
});
