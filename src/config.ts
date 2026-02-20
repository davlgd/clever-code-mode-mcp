export interface Config {
  apiToken: string;
  executionTimeoutMs: number;
  maxOutputLength: number;
}

export function getConfig(): Config {
  const apiToken = process.env.CLEVER_CLOUD_API_TOKEN;
  if (!apiToken) {
    console.error(
      "CLEVER_CLOUD_API_TOKEN environment variable is required.\n" +
        "Create an API token at https://console.clever-cloud.com/users/me/tokens",
    );
    process.exit(1);
  }

  return {
    apiToken,
    executionTimeoutMs: parseInt(
      process.env.CC_MCP_TIMEOUT_MS ?? "30000",
      10,
    ),
    maxOutputLength: parseInt(process.env.CC_MCP_MAX_OUTPUT ?? "50000", 10),
  };
}
