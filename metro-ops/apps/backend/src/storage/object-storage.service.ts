import { Injectable } from "@nestjs/common";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { logger } from "../observability/structured-logger.js";

@Injectable()
export class ObjectStorageService {
  private readonly rootDir = resolve(
    process.env.OBJECT_STORE_DIR ?? ".metro-ops/uploads",
  );

  write(key: string, buffer: Buffer): void {
    const path = this.pathForKey(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
    logger.info(
      { event: "object_storage.write", key, bytes: buffer.byteLength },
      "object stored",
    );
  }

  read(key: string): Buffer {
    return readFileSync(this.pathForKey(key));
  }

  private pathForKey(key: string): string {
    const safeKey = key.replace(/^\.+/g, "").replace(/\\/g, "/");
    return join(this.rootDir, safeKey);
  }
}
