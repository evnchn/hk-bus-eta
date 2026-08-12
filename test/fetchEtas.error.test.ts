import { fetchEtas } from "../src";
import type { RouteListEntry } from "../src/type";

const KMB_HOST = "data.etabus.gov.hk";
const CTB_HOST = "citybus";

const kmbBody = (dir: string, seq: number, count: number) => ({
  type: "ETA",
  version: "1.0",
  data: Array.from({ length: count }, (_, i) => ({
    co: "KMB",
    route: "101",
    dir,
    service_type: 1,
    seq,
    dest_tc: "觀塘",
    dest_en: "KWUN TONG",
    eta_seq: i + 1,
    eta: `2026-08-12T1${i}:00:00+08:00`,
    rmk_tc: "",
    rmk_en: "",
  })),
});

const ctbBody = (dir: string, seq: number, count: number) => ({
  type: "ETA",
  version: "2.0",
  data: Array.from({ length: count }, (_, i) => ({
    co: "CTB",
    route: "101",
    dir,
    seq,
    dest_tc: "觀塘",
    dest_en: "KWUN TONG",
    eta_seq: i + 1,
    eta: `2026-08-12T2${i}:00:00+08:00`,
    rmk_tc: "",
    rmk_en: "",
  })),
});

const ok = (body: unknown) =>
  Promise.resolve({ json: () => Promise.resolve(body) } as Response);

/** Fake fetch: per-host either resolves with a body or rejects like a blocked request. */
const installFetch = (plan: {
  kmb?: unknown | "reject";
  ctb?: unknown | "reject";
}) => {
  global.fetch = jest.fn((input: any) => {
    const url = String(input);
    if (url.includes(KMB_HOST)) {
      if (plan.kmb === "reject")
        return Promise.reject(new TypeError("Failed to fetch"));
      return ok(plan.kmb);
    }
    if (url.includes(CTB_HOST)) {
      if (plan.ctb === "reject")
        return Promise.reject(new TypeError("Failed to fetch"));
      return ok(plan.ctb);
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as any;
};

const route = (co: RouteListEntry["co"]): any => ({
  route: "101",
  co,
  orig: { zh: "堅尼地城", en: "KENNEDY TOWN" },
  dest: { zh: "觀塘", en: "KWUN TONG" },
  fares: null,
  faresHoliday: null,
  freq: null,
  jt: null,
  seq: 0,
  serviceType: "1",
  stops: { kmb: ["KMB_A", "KMB_B"], ctb: ["001152", "001153"] },
  bound: { kmb: "I", ctb: "O" },
  gtfsId: "",
  nlbId: "",
  language: "zh",
});

let errSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
  jest.restoreAllMocks();
});

test("success: hasError is false and etas are returned", async () => {
  installFetch({ kmb: kmbBody("I", 1, 3) });
  const etas = await fetchEtas(route(["kmb"]));
  expect(etas.length).toBe(3);
  expect(etas.hasError).toBe(false);
});

test("genuinely empty: hasError is false", async () => {
  installFetch({ kmb: { type: "ETA", version: "1.0", data: [] } });
  const etas = await fetchEtas(route(["kmb"]));
  expect(etas.length).toBe(0);
  expect(etas.hasError).toBe(false);
});

test("blocked: hasError is true and etas are empty", async () => {
  installFetch({ kmb: "reject" });
  const etas = await fetchEtas(route(["kmb"]));
  expect(etas.length).toBe(0);
  expect(etas.hasError).toBe(true);
});

test("mixed: KMB blocked, CTB succeeds — real etas survive alongside hasError", async () => {
  installFetch({ kmb: "reject", ctb: ctbBody("O", 1, 3) });
  const etas = await fetchEtas(route(["kmb", "ctb"]));
  expect(etas.hasError).toBe(true);
  expect(etas.length).toBe(3);
  expect(etas.every((e) => e.co === "ctb")).toBe(true);
  expect(etas.every((e) => Boolean(e.eta))).toBe(true);
});

test("mixed the other way: CTB blocked, KMB succeeds — real etas survive", async () => {
  installFetch({ kmb: kmbBody("I", 1, 2), ctb: "reject" });
  const etas = await fetchEtas(route(["kmb", "ctb"]));
  expect(etas.hasError).toBe(true);
  expect(etas.length).toBe(2);
  expect(etas.every((e) => e.co === "kmb")).toBe(true);
});

test("result stays a plain array for existing callers", async () => {
  installFetch({ kmb: kmbBody("I", 1, 2) });
  const etas = await fetchEtas(route(["kmb"]));
  expect(Array.isArray(etas)).toBe(true);
  expect(etas.map((e) => e.co)).toEqual(["kmb", "kmb"]);
  expect(JSON.parse(JSON.stringify(etas)).length).toBe(2);
});
