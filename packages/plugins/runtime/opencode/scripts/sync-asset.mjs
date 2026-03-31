import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const OPENCODE_INLINE_IMPORTS = new Set(['./adapter.js']);

function extractTopLevelImports(source) {
  const match = source.match(/^(?<imports>(?:import .+;\n)+\n*)?(?<body>[\s\S]*)$/);
  const importsBlock = match?.groups?.imports?.trim() ?? '';
  const body = match?.groups?.body?.trimStart() ?? source.trimStart();
  const imports = importsBlock ? importsBlock.split('\n').filter(Boolean) : [];

  return {
    imports,
    body,
  };
}

function splitStandaloneImports(importLines, sourceLabel) {
  const externalImports = [];

  for (const line of importLines) {
    const importPath = line.match(/from ['"]([^'"]+)['"]/u)?.[1];
    if (!importPath) {
      externalImports.push(line);
      continue;
    }

    if (!importPath.startsWith('.')) {
      externalImports.push(line);
      continue;
    }

    if (OPENCODE_INLINE_IMPORTS.has(importPath)) {
      continue;
    }

    throw new Error(
      `Unsupported relative import "${importPath}" in ${sourceLabel}. OpenCode packaged asset must remain standalone.`,
    );
  }

  return externalImports;
}

export async function generateOpencodePluginAsset(opencodeRoot = packageRoot) {
  const [adapterSource, indexSource] = await Promise.all([
    fs.readFile(path.join(opencodeRoot, 'src', 'adapter.ts'), 'utf8'),
    fs.readFile(path.join(opencodeRoot, 'src', 'index.ts'), 'utf8'),
  ]);
  const adapterModule = extractTopLevelImports(adapterSource);
  const indexModule = extractTopLevelImports(indexSource);
  const externalImports = [
    ...splitStandaloneImports(adapterModule.imports, 'packages/plugins/runtime/opencode/src/adapter.ts'),
    ...splitStandaloneImports(indexModule.imports, 'packages/plugins/runtime/opencode/src/index.ts'),
  ];
  const dedupedImports = [...new Set(externalImports)];

  return [
    '// This file is generated from src/adapter.ts and src/index.ts.',
    '// Do not edit manually.',
    '',
    dedupedImports.join('\n'),
    dedupedImports.length > 0 ? '' : null,
    adapterModule.body.trimEnd(),
    '',
    indexModule.body.trimEnd(),
    '',
  ].filter((part) => part !== null).join('\n');
}

async function writeFileIfChanged(targetPath, content) {
  const existingContent = await fs.readFile(targetPath, 'utf8').catch(() => null);
  if (existingContent === content) {
    return false;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
  return true;
}

export async function syncOpencodePluginAsset(opencodeRoot = packageRoot) {
  const asset = await generateOpencodePluginAsset(opencodeRoot);
  const assetPath = path.join(opencodeRoot, 'assets', 'corivo.ts');
  const updated = await writeFileIfChanged(assetPath, asset);
  return {
    asset,
    assetPath,
    updated,
  };
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedAsScript) {
  syncOpencodePluginAsset().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
