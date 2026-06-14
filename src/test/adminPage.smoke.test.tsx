import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: undefined,
    })),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    functions: { invoke: vi.fn() },
  },
}));

describe("AdminPage module", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("imports without throwing", async () => {
    const mod = await import("@/pages/AdminPage");
    expect(mod.default).toBeDefined();
  });
});
