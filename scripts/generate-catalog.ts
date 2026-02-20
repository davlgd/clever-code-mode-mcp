import fs from "node:fs";
import path from "node:path";

const CLIENT_PKG_DIR = path.resolve("node_modules/@clevercloud/client");
const COMMANDS_SRC_DIR = path.join(
  CLIENT_PKG_DIR,
  "src/clients/cc-api/commands",
);
const COMMANDS_TYPES_DIR = path.join(
  CLIENT_PKG_DIR,
  "dist/types/src/clients/cc-api/commands",
);
const CATALOG_OUT = path.resolve("src/catalog/command-catalog.json");
const REGISTRY_OUT = path.resolve("src/commands/command-registry.ts");

// Known base types that command inputs extend via `extends`
const BASE_TYPES: Record<string, Record<string, { type: string; required: boolean }>> = {
  ApplicationId: {
    applicationId: { type: "string", required: true },
    ownerId: { type: "string", required: false },
  },
  AddonId: {
    addonId: { type: "string", required: true },
    ownerId: { type: "string", required: false },
  },
  AddonProviderId: {
    addonProviderId: { type: "string", required: true },
    ownerId: { type: "string", required: false },
  },
  OauthConsumerKey: {
    oauthConsumerKey: { type: "string", required: true },
    ownerId: { type: "string", required: false },
  },
  ApplicationOrAddonId: {
    applicationId: { type: "string", required: false },
    addonId: { type: "string", required: false },
    ownerId: { type: "string", required: false },
  },
};

interface CatalogEntry {
  className: string;
  category: string;
  importSubpath: string;
  description: string;
  params: Record<string, string>;
  requiredParams: string[];
  endpoints: string[];
  isStream: boolean;
}

function classNameToDescription(className: string): string {
  // Remove "Command" suffix, split PascalCase
  const withoutCommand = className.replace(/Command$/, "");
  const words = withoutCommand.replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function extractExportedClasses(source: string): string[] {
  const classes: string[] = [];
  const re = /^export\s+class\s+(\w+Command)\s+extends\s+/gm;
  let match;
  while ((match = re.exec(source)) !== null) {
    const name = match[1];
    // Skip inner/internal commands — they're implementation details
    if (name.includes("Inner")) continue;
    classes.push(name);
  }
  return classes;
}

function extractEndpoints(source: string): string[] {
  const endpoints: string[] = [];
  const re = /@endpoint\s+(\[.+?\].*)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    endpoints.push(match[1].trim());
  }
  return endpoints;
}

function isStreamCommand(source: string, className: string): boolean {
  // Check if the class extends a stream command base
  const re = new RegExp(
    `class\\s+${className}\\s+extends\\s+\\w*Stream\\w*`,
  );
  return re.test(source);
}

function parseTypesFile(
  typesContent: string,
  className: string,
): { params: Record<string, string>; requiredParams: string[] } {
  const params: Record<string, string> = {};
  const requiredParams: string[] = [];

  // Find the CommandInput interface for this class
  const inputName = `${className}Input`;

  // Match: interface XxxCommandInput { ... } or interface XxxCommandInput extends BaseType { ... }
  const interfaceRe = new RegExp(
    `interface\\s+${inputName}(?:\\s+extends\\s+([\\w,\\s]+))?\\s*\\{([^}]*)\\}`,
    "s",
  );
  const match = interfaceRe.exec(typesContent);

  if (!match) {
    // No input interface found — command takes no params
    return { params, requiredParams };
  }

  const extendsClause = match[1]?.trim();
  const body = match[2];

  // Resolve extended base types
  if (extendsClause) {
    const baseNames = extendsClause.split(",").map((s) => s.trim());
    for (const baseName of baseNames) {
      // Handle Omit<BaseType, 'field'> — skip these (internal commands)
      if (baseName.startsWith("Omit")) continue;

      const baseParams = BASE_TYPES[baseName];
      if (baseParams) {
        for (const [name, info] of Object.entries(baseParams)) {
          params[name] = info.type;
          if (info.required) requiredParams.push(name);
        }
      }
    }
  }

  // Parse properties from the interface body
  const propRe = /(\w+)(\??):\s*([^;]+);/g;
  let propMatch;
  while ((propMatch = propRe.exec(body)) !== null) {
    const propName = propMatch[1];
    const optional = propMatch[2] === "?";
    let propType = propMatch[3].trim();

    // Simplify complex types for the catalog
    propType = simplifyType(propType);

    params[propName] = propType;
    if (!optional) {
      requiredParams.push(propName);
    }
  }

  return { params, requiredParams };
}

function simplifyType(type: string): string {
  // Array<X> -> X[]
  type = type.replace(/Array<(\w+)>/g, "$1[]");
  // Remove inline union types that are too verbose
  if (type.includes("|") && type.length > 40) {
    return "string";
  }
  // Date | string | number -> string
  if (type === "Date | string | number") return "string | number";
  return type;
}

function main() {
  const catalog: CatalogEntry[] = [];
  const registryImports: string[] = [];
  const registryEntries: string[] = [];
  const seenClassNames = new Set<string>();

  const categories = fs.readdirSync(COMMANDS_SRC_DIR).sort();

  for (const category of categories) {
    const categoryDir = path.join(COMMANDS_SRC_DIR, category);
    if (!fs.statSync(categoryDir).isDirectory()) continue;

    const files = fs
      .readdirSync(categoryDir)
      .filter((f) => f.endsWith("-command.js") && !f.startsWith("abstract"))
      .sort();

    for (const file of files) {
      const source = fs.readFileSync(path.join(categoryDir, file), "utf-8");
      const exportedClasses = extractExportedClasses(source);

      if (exportedClasses.length === 0) continue;

      const endpoints = extractEndpoints(source);

      for (const className of exportedClasses) {
        // Deduplicate: same class name may be exported from multiple files (client library bug)
        if (seenClassNames.has(className)) continue;

        seenClassNames.add(className);

        const isStream = isStreamCommand(source, className);

        // Try to read the types file
        const typesFile = file.replace(".js", ".types.d.ts");
        const typesPath = path.join(COMMANDS_TYPES_DIR, category, typesFile);

        let params: Record<string, string> = {};
        let requiredParams: string[] = [];

        if (fs.existsSync(typesPath)) {
          const typesContent = fs.readFileSync(typesPath, "utf-8");
          const parsed = parseTypesFile(typesContent, className);
          params = parsed.params;
          requiredParams = parsed.requiredParams;
        }

        const importSubpath = `${category}/${file}`;

        catalog.push({
          className,
          category,
          importSubpath,
          description: classNameToDescription(className),
          params,
          requiredParams,
          endpoints,
          isStream,
        });

        registryImports.push(
          `import { ${className} } from "@clevercloud/client/cc-api-commands/${importSubpath}";`,
        );
        registryEntries.push(`  ${className},`);
      }
    }
  }

  // Write catalog JSON
  fs.mkdirSync(path.dirname(CATALOG_OUT), { recursive: true });
  fs.writeFileSync(CATALOG_OUT, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Generated catalog: ${catalog.length} commands -> ${CATALOG_OUT}`);

  // Write command registry
  fs.mkdirSync(path.dirname(REGISTRY_OUT), { recursive: true });
  const registryContent = `// Generated by scripts/generate-catalog.ts — do not edit manually
${registryImports.join("\n")}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const commands: Record<string, new (params?: any) => any> = {
${registryEntries.join("\n")}
};
`;
  fs.writeFileSync(REGISTRY_OUT, registryContent);
  console.log(`Generated registry: ${registryEntries.length} commands -> ${REGISTRY_OUT}`);
}

main();
