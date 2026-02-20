#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./config.js";
import { createClient } from "./client/create-client.js";
import { registerSearchTool } from "./tools/search.js";
import { registerExecuteTool } from "./tools/execute.js";

async function main() {
  const config = getConfig();
  const client = createClient(config);

  const server = new McpServer({
    name: "clever-cloud",
    version: "0.1.0",
  });

  registerSearchTool(server);
  registerExecuteTool(server, client, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
