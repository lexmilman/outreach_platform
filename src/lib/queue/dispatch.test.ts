import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const createClientMock = vi.fn(async () => ({ rpc: rpcMock }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const ORG = "11111111-1111-1111-1111-111111111111";
const PERSON = "22222222-2222-2222-2222-222222222222";

describe("enqueueJob", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    createClientMock.mockClear();
  });

  it("validates payload then forwards to enqueue_job RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: 42, error: null });
    const { enqueueJob } = await import("./dispatch");
    const res = await enqueueJob({
      type: "enrich_person_apify",
      payload: { personId: PERSON },
      orgId: ORG,
    });
    expect(res).toEqual({ ok: true, msgId: 42 });
    expect(rpcMock).toHaveBeenCalledWith("enqueue_job", {
      p_type: "enrich_person_apify",
      p_payload: { personId: PERSON },
      p_org_id: ORG,
      p_delay: 0,
    });
  });

  it("rejects malformed payload before hitting the DB", async () => {
    const { enqueueJob } = await import("./dispatch");
    const res = await enqueueJob({
      type: "enrich_person_apify",
      // @ts-expect-error — intentionally wrong shape
      payload: { not_a_real_key: 1 },
      orgId: ORG,
    });
    expect(res.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("propagates RPC errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "forbidden" } });
    const { enqueueJob } = await import("./dispatch");
    const res = await enqueueJob({
      type: "enrich_person_apify",
      payload: { personId: PERSON },
      orgId: ORG,
    });
    expect(res).toEqual({ ok: false, error: "forbidden" });
  });

  it("forwards delay", async () => {
    rpcMock.mockResolvedValueOnce({ data: 1, error: null });
    const { enqueueJob } = await import("./dispatch");
    await enqueueJob({
      type: "sync_instantly_stats",
      payload: {},
      orgId: ORG,
      delaySec: 60,
    });
    expect(rpcMock.mock.calls[0]?.[1]?.p_delay).toBe(60);
  });
});
