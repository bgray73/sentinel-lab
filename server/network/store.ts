import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NetworkData } from "./types.js";
const empty = (): NetworkData => ({ counters: [], snapshot: null, flaps: [] });
export class NetworkStore {
  constructor(private readonly filePath: string) {}
  async load() {
    try {
      const value = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as Partial<NetworkData>;
      return {
        counters: Array.isArray(value.counters) ? value.counters : [],
        snapshot: value.snapshot || null,
        flaps: Array.isArray(value.flaps) ? value.flaps : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw error;
    }
  }
  async save(data: NetworkData) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
