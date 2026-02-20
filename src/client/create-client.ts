import { CcApiClient } from "@clevercloud/client/cc-api-client.js";
import { FileStore } from "@clevercloud/client/cc-api-file-store.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { Config } from "../config.js";

export function createClient(config: Config): CcApiClient {
  const configDir = path.join(
    os.homedir(),
    ".config",
    "clever-code-mode-mcp",
  );
  fs.mkdirSync(configDir, { recursive: true });

  const storePath = path.join(configDir, "resource-id-cache.json");

  return new CcApiClient({
    authMethod: {
      type: "api-token",
      apiToken: config.apiToken,
    },
    resourceIdResolverStore: new FileStore(storePath),
  });
}
