import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type CacheMode = "on" | "off" | "replay";

/**
 * Private on-disk response cache. Qloo's terms allow private server-side caching but forbid
 * publishing response data in a public repository, so the cache lives in .cache/ (gitignored)
 * and offline tests use small synthetic fixtures instead.
 */
export class ResponseCache {
  constructor(
    private readonly dir: string,
    readonly mode: CacheMode,
  ) {}

  static keyFor(pathname: string, params: Record<string, string>): string {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHash("sha256").update(`${pathname}?${sorted}`).digest("hex");
  }

  private file(key: string) {
    return path.join(this.dir, `${key}.json`);
  }

  async get(key: string): Promise<unknown | undefined> {
    if (this.mode === "off") return undefined;
    try {
      return JSON.parse(await fs.readFile(this.file(key), "utf8"));
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    if (this.mode !== "on") return;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(key), JSON.stringify(value));
  }
}
