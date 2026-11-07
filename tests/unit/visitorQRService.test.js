import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), single: vi.fn() }));
vi.mock("../../db/supabaseClient.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../../utils/qrGenerator.js", () => ({ generateQR: vi.fn(), generateQRToken: vi.fn() }));
vi.mock("../../services/emailService.js", () => ({ sendApprovalEmail: vi.fn(), sendCancellationEmail: vi.fn() }));
vi.mock("@/services/logService.js", () => ({ createLog: vi.fn() }));
vi.mock("../../services/pushNotificationService.js", () => ({ sendVisitStatusPush: vi.fn() }));
import { getVisitQRByIdAndVisitanteId } from "../../services/visitService.js";

let queries;
beforeEach(() => {
    vi.resetAllMocks();
    queries = [];
    mocks.from.mockImplementation(() => {
        const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
        query.select.mockReturnValue(query);
        query.eq.mockReturnValue(query);
        query.maybeSingle.mockImplementation(() => mocks.single(query.eq.mock.calls));
        queries.push(query);
        return query;
    });
});
describe("visitor QR service ownership filters", () => {
    it("filters by numeric visit id AND authenticated visitor id", async () => {
        const data = { id: 1, qr_code: "own-token" };
        mocks.single.mockResolvedValue({ data, error: null });
        expect(await getVisitQRByIdAndVisitanteId("1", "7")).toEqual(data);
        expect(mocks.from).toHaveBeenCalledExactlyOnceWith("Visitas");
        expect(queries[0].eq.mock.calls).toEqual([["id", 1], ["visitante_id", 7]]);
        expect(queries[0].select).toHaveBeenCalledWith(expect.stringContaining("Accesos_QR (id)"));
        expect(queries[0].maybeSingle).toHaveBeenCalledTimes(1);
    });
    it("retains ownership filtering when URL id is manipulated", async () => {
        // This fake only returns a row when BOTH actual query filters match it.
        const row = { id: 99, visitante_id: 9, qr_code: "someone-elses-token" };
        mocks.single.mockImplementation(filters => Promise.resolve({
            data: filters.every(([field, value]) => row[field] === value) ? row : null, error: null,
        }));
        expect(await getVisitQRByIdAndVisitanteId("99", 7)).toBeNull();
        expect(queries[0].eq.mock.calls).toEqual([["id", 99], ["visitante_id", 7]]);
        expect(await getVisitQRByIdAndVisitanteId("99", 9)).toEqual(row);
    });
    it("propagates query failures for the route to sanitize", async () => {
        mocks.single.mockResolvedValue({ data: null, error: { message: "database detail" } });
        await expect(getVisitQRByIdAndVisitanteId("1", 7)).rejects.toThrow("database detail");
    });
    it("does not mix concurrent query filters or results", async () => {
        let finish;
        mocks.single.mockImplementation(filters => filters[0][1] === 1
            ? new Promise(resolve => { finish = resolve; })
            : Promise.resolve({ data: null, error: null }));
        const own = getVisitQRByIdAndVisitanteId("1", 7);
        expect(await getVisitQRByIdAndVisitanteId("99", 7)).toBeNull();
        finish({ data: { id: 1, qr_code: "own-token" }, error: null });
        expect(await own).toEqual({ id: 1, qr_code: "own-token" });
        expect(queries.map(query => query.eq.mock.calls)).toEqual([
            [["id", 1], ["visitante_id", 7]], [["id", 99], ["visitante_id", 7]],
        ]);
    });
});
