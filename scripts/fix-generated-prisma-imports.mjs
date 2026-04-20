import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(scriptDir, "..", "generated", "prisma", "client");

const fromSpecifierPattern = /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g;
const dynamicImportPattern = /(import\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g;

function withTsExtension(specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return specifier;
  }

  return path.posix.extname(specifier) ? specifier : `${specifier}.ts`;
}

function rewriteSource(source) {
  return source
    .replace(fromSpecifierPattern, (_, prefix, specifier, suffix) => {
      return `${prefix}${withTsExtension(specifier)}${suffix}`;
    })
    .replace(dynamicImportPattern, (_, prefix, specifier, suffix) => {
      return `${prefix}${withTsExtension(specifier)}${suffix}`;
    });
}

async function collectTypeScriptFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const targetPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectTypeScriptFiles(targetPath);
      }

      return targetPath.endsWith(".ts") ? [targetPath] : [];
    })
  );

  return files.flat();
}

async function main() {
  const files = await collectTypeScriptFiles(clientDir);
  let updatedFiles = 0;

  for (const file of files) {
    const original = await fs.readFile(file, "utf8");
    const rewritten = rewriteSource(original);

    if (rewritten !== original) {
      await fs.writeFile(file, rewritten, "utf8");
      updatedFiles += 1;
    }
  }

  console.log(
    updatedFiles > 0
      ? `Adjusted relative imports in ${updatedFiles} generated Prisma file(s).`
      : "Generated Prisma imports already normalized."
  );
}

await main();
