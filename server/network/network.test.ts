import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePrometheus } from "../hardware/snmp.js";
import { normalizeInterfaces } from "./collector.js";
import { NetworkService } from "./service.js";
import type { NetworkThresholds } from "./types.js";
const target = {
    id: "core",
    name: "Core",
    target: "10.0.0.2",
    category: "switch" as const,
    module: "if_mib",
    auth: "sentinel_v3",
  },
  thresholds: NetworkThresholds = {
    utilizationWarningPercent: 70,
    utilizationCriticalPercent: 90,
    errorsWarningPerSecond: 1,
    errorsCriticalPerSecond: 100,
    flapWindowMinutes: 15,
    flapWarningCount: 3,
  };
describe("network interface normalization", () => {
  it("calculates rates and utilization from counter deltas", () => {
    const first = parsePrometheus(
      'ifAdminStatus{ifIndex="1",ifName="Ethernet1/1",ifAlias="pve-01"} 1\nifOperStatus{ifIndex="1",ifName="Ethernet1/1"} 1\nifHighSpeed{ifIndex="1"} 1000\nifHCInOctets{ifIndex="1"} 1000\nifHCOutOctets{ifIndex="1"} 2000\nifInErrors{ifIndex="1"} 0\nifOutErrors{ifIndex="1"} 0\n',
    );
    const initial = normalizeInterfaces(
      target,
      first,
      [],
      [],
      thresholds,
      "2026-09-15T00:00:00Z",
    );
    const second = parsePrometheus(
      'ifAdminStatus{ifIndex="1",ifName="Ethernet1/1",ifAlias="pve-01"} 1\nifOperStatus{ifIndex="1",ifName="Ethernet1/1"} 1\nifHighSpeed{ifIndex="1"} 1000\nifHCInOctets{ifIndex="1"} 900001000\nifHCOutOctets{ifIndex="1"} 450002000\nifInErrors{ifIndex="1"} 120\nifOutErrors{ifIndex="1"} 0\n',
    );
    const value = normalizeInterfaces(
      target,
      second,
      initial.counters,
      [],
      thresholds,
      "2026-09-15T00:01:00Z",
    ).interfaces[0];
    expect(value).toMatchObject({
      name: "Ethernet1/1",
      alias: "pve-01",
      rxBytesPerSecond: 15000000,
      utilizationPercent: 12,
      errorsPerSecond: 2,
      health: "warning",
    });
  });
  it("treats an administratively down port as disabled and detects an unexpected link transition", () => {
    const up = parsePrometheus(
      'ifAdminStatus{ifIndex="1",ifName="Eth1"} 1\nifOperStatus{ifIndex="1",ifName="Eth1"} 1\n',
    );
    const initial = normalizeInterfaces(
      target,
      up,
      [],
      [],
      thresholds,
      "2026-09-15T00:00:00Z",
    );
    const down = parsePrometheus(
      'ifAdminStatus{ifIndex="1",ifName="Eth1"} 1\nifOperStatus{ifIndex="1",ifName="Eth1"} 2\nifAdminStatus{ifIndex="2",ifName="Eth2"} 2\nifOperStatus{ifIndex="2",ifName="Eth2"} 2\n',
    );
    const value = normalizeInterfaces(
      target,
      down,
      initial.counters,
      [],
      thresholds,
      "2026-09-15T00:01:00Z",
    );
    expect(value.interfaces.find((item) => item.ifIndex === "1")).toMatchObject(
      { health: "critical", flapsInWindow: 1 },
    );
    expect(value.interfaces.find((item) => item.ifIndex === "2")?.health).toBe(
      "disabled",
    );
  });
});

describe("network service", () => {
  it("persists a safe simulated snapshot and exports metrics", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "sentinel-network-"));
    const file = path.join(directory, "network.json");
    try {
      const service = new NetworkService({ SENTINEL_NETWORK_FILE: file });
      await service.ready;
      expect(service.snapshot().current?.summary).toMatchObject({
        devices: 2,
        interfaces: 6,
        up: 6,
      });
      expect(service.prometheus()).toContain(
        'sentinel_network_interface_health{device="nexus-core-01"',
      );
      expect(
        JSON.parse(await readFile(file, "utf8")).snapshot.interfaces,
      ).toHaveLength(6);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports a live configuration error without rejecting startup", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "sentinel-network-"));
    try {
      const service = new NetworkService({
        SENTINEL_REAL_NETWORK: "true",
        SENTINEL_NETWORK_FILE: path.join(directory, "network.json"),
      });
      await expect(service.ready).resolves.toBeUndefined();
      expect(service.status()).toMatchObject({
        mode: "live",
        configured: false,
        lastError: expect.stringContaining("requires an SNMP exporter"),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
