import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const testUrl = "https://supabase.example.invalid";
const testKey = "unit-test-mock-only";

beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

it("imports the client, a service and a route without Supabase configuration", async () => {
    await import("../../db/supabaseClient.js");
    await import("../../services/pushNotificationService.js");
    await import("../../app/api/department/route.js");

    expect(createClient).not.toHaveBeenCalled();
});

it("reads runtime configuration on first use and reuses the configured client", async () => {
    const { GET } = await import("../../app/api/department/route.js");
    const departments = [{ id: 1, nombre: "Recepción" }];
    const order = vi.fn().mockResolvedValue({ data: departments, error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    createClient.mockReturnValue({ from });
    vi.stubEnv("SUPABASE_URL", testUrl);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", testKey);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: departments });
    expect((await GET()).status).toBe(200);

    expect(createClient).toHaveBeenCalledExactlyOnceWith(testUrl, testKey, {
        auth: { persistSession: false },
    });
    expect(from).toHaveBeenCalledWith("Departamentos");
    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("nombre", { ascending: true });
});

it.each([
    ["SUPABASE_URL", undefined, testKey],
    ["SUPABASE_SERVICE_ROLE_KEY", testUrl, undefined],
])("reports missing %s only when a route queries Supabase", async (variable, url, key) => {
    vi.stubEnv("SUPABASE_URL", url);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
        const { GET } = await import("../../app/api/department/route.js");
        const response = await GET();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            success: false,
            error: `${variable} es obligatoria para usar Supabase`,
        });
        expect(createClient).not.toHaveBeenCalled();
    } finally {
        log.mockRestore();
    }
});
