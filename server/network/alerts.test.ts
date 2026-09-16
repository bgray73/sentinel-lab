import { describe, expect, it, vi } from "vitest";
import { NetworkAlertService } from "./alerts.js";
import type { NetworkSnapshot } from "./types.js";

const base: NetworkSnapshot = {
  mode: "live",
  collectedAt: "2026-09-16T00:00:00Z",
  collectionErrors: [],
  flaps: [],
  summary: {
    devices: 1,
    interfaces: 1,
    up: 0,
    down: 1,
    disabled: 0,
    warning: 0,
    critical: 1,
    highUtilization: 0,
    erroring: 0,
    recentFlaps: 1,
  },
  interfaces: [
    {
      key: "core/1",
      deviceId: "core",
      deviceName: "Core",
      managementAddress: "10.0.0.2",
      ifIndex: "1",
      name: "Ethernet1/1",
      alias: "pve-01",
      adminState: "up",
      operState: "down",
      health: "critical",
      speedMbps: 40000,
      rxBytesPerSecond: 0,
      txBytesPerSecond: 0,
      utilizationPercent: 0,
      errorsPerSecond: 0,
      discardsPerSecond: 0,
      flapsInWindow: 1,
      lastChangeSeconds: 3,
      collectedAt: "2026-09-16T00:00:00Z",
    },
  ],
};

describe("network interface alerts", () => {
  it("opens, deduplicates, and resolves an interface incident", async () => {
    let network = base;
    const incidents: any[] = [];
    const reconcile = vi.fn(async (input: any) => {
      const existing = incidents.find(
        (item) =>
          item.ruleId === `system-${input.key}` && item.status !== "resolved",
      );
      if (input.state === "ready") {
        if (existing) existing.status = "resolved";
        return existing || null;
      }
      if (existing) return existing;
      const created = {
        id: "incident-1",
        ruleId: `system-${input.key}`,
        monitorId: `system/${input.key}`,
        title: input.title,
        summary: input.summary,
        severity: input.state === "not-ready" ? "critical" : "warning",
        status: "open",
        occurrences: 1,
        openedAt: "2026-09-16T00:00:00Z",
        updatedAt: "2026-09-16T00:00:00Z",
      };
      incidents.push(created);
      return created;
    });
    const source = {
      ready: Promise.resolve(),
      snapshot: () => ({ status: {}, current: network }),
    };
    const monitoring = {
      ready: Promise.resolve(),
      reconcileSystemIncident: reconcile,
      incidents: () => incidents,
    };
    const service = new NetworkAlertService(
      source as never,
      monitoring as never,
      { SENTINEL_NETWORK_ALERTS_ENABLED: "true" },
      false,
    );
    await service.ready;
    expect((await service.evaluate()).state).toBe("critical");
    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "not-ready",
        title: "Core Ethernet1/1 is critical",
      }),
    );
    await service.evaluate();
    expect(service.status()).toMatchObject({
      activeIncidents: 1,
      eligibleInterfaces: 1,
    });
    network = {
      ...base,
      summary: { ...base.summary, up: 1, down: 0, critical: 0 },
      interfaces: [
        {
          ...base.interfaces[0],
          operState: "up",
          health: "healthy",
          flapsInWindow: 0,
        },
      ],
    };
    expect((await service.evaluate()).state).toBe("healthy");
    expect(reconcile).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "ready" }),
    );
  });

  it("creates warning incidents for policy degradation", async () => {
    const warning = {
      ...base,
      interfaces: [
        {
          ...base.interfaces[0],
          operState: "up" as const,
          health: "warning" as const,
          utilizationPercent: 78,
          flapsInWindow: 3,
        },
      ],
      summary: { ...base.summary, up: 1, down: 0, warning: 1, critical: 0 },
    };
    const reconcile = vi.fn(async () => null);
    const service = new NetworkAlertService(
      {
        ready: Promise.resolve(),
        snapshot: () => ({ status: {}, current: warning }),
      } as never,
      {
        ready: Promise.resolve(),
        reconcileSystemIncident: reconcile,
        incidents: () => [],
      } as never,
      { SENTINEL_NETWORK_ALERTS_ENABLED: "true" },
      false,
    );
    await service.evaluate();
    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "at-risk",
        summary: expect.stringContaining("utilization is 78%"),
      }),
    );
  });

  it("is disabled by default and validates settings", () => {
    const source = {
      ready: Promise.resolve(),
      snapshot: () => ({ status: {}, current: base }),
    };
    const monitoring = {
      ready: Promise.resolve(),
      reconcileSystemIncident: vi.fn(),
      incidents: () => [],
    };
    const service = new NetworkAlertService(
      source as never,
      monitoring as never,
      {},
      false,
    );
    expect(() => service.evaluate()).toThrow(/disabled/);
    expect(
      () =>
        new NetworkAlertService(
          source as never,
          monitoring as never,
          { SENTINEL_NETWORK_ALERT_INTERVAL_SECONDS: "2" },
          false,
        ),
    ).toThrow(/30 to 86400/);
  });
});
