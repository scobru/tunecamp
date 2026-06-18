/**
 * Transforms test files with top-level `await import(...)` to use `beforeAll`.
 * Handles the pattern:
 *   const { X } = await import('...');   -> let X: any; + beforeAll
 *   const { default: Y } = await import('...');
 *   const Z = await import('...');
 *   const provider = new ProviderClass();  (adjacent instantiation)
 */
import fs from 'fs';

const FILES = [
  'src/server/providers/metadata/__tests__/itunes.provider.test.ts',
  'src/server/providers/metadata/__tests__/bandcamp.provider.test.ts',
  'src/server/providers/metadata/__tests__/discogs.provider.test.ts',
  'src/server/providers/metadata/__tests__/musicbrainz.provider.test.ts',
  'src/server/providers/metadata/__tests__/soundcloud.provider.test.ts',
  'src/server/providers/metadata/__tests__/spotify.provider.test.ts',
  'src/server/providers/metadata/__tests__/theaudiodb.provider.test.ts',
  'src/server/providers/playlists/__tests__/deezer.playlist.test.ts',
  'src/server/providers/scrobble/__tests__/listenbrainz.provider.test.ts',
  'src/server/providers/storage/__tests__/google-drive.provider.test.ts',
  'src/server/providers/streaming/__tests__/bandcamp.provider.test.ts',
  'src/server/providers/streaming/__tests__/soundcloud.provider.test.ts',
  'src/server/routes/admin/__tests__/browser.test.ts',
  'src/server/routes/admin/__tests__/metadata.security.test.ts',
  'src/server/routes/admin/__tests__/stats.test.ts',
  'src/server/routes/api/__tests__/payments.test.ts',
  'src/server/routes/api/__tests__/rss.test.ts',
  'src/server/routes/library/__tests__/import.security.test.ts',
  'src/server/routes/network/__tests__/proxy.security.test.ts',
  'src/utils/networkUtils.test.ts',
  'src/server/modules/media/ffmpeg.test.ts',
  'src/server/modules/media/media-engine.test.ts',
  'src/server/modules/network/federated-discovery.service.test.ts',
];

// Regex: top-level const ... = await import(...)
// Must NOT be inside a function/arrow (we check by ensuring no leading spaces beyond 0)
const TOP_AWAIT_IMPORT = /^(const|let)\s+(.+?)\s*=\s*await\s+import\s*\(([^)]+)\)\s*;?\s*$/;
// Adjacent plain instantiation: const x = new Something(...)
const TOP_NEW = /^(const|let)\s+(\w+)\s*=\s*new\s+(\w[\w.<>]*)\s*\(([^)]*)\)\s*;?\s*$/;
// Also: const x = await import(...) without destructuring
const TOP_AWAIT_WHOLE = /^(const|let)\s+(\w+)\s*=\s*await\s+import\s*\(([^)]+)\)\s*;?\s*$/;

function extractVarNames(lhs) {
  // e.g. "{ default: fetch }" -> ["fetch"]  (alias used)
  // e.g. "{ X, Y, Z }" -> ["X", "Y", "Z"]
  // e.g. "X" -> ["X"]
  const s = lhs.trim();
  if (s.startsWith('{')) {
    const inner = s.slice(1, s.lastIndexOf('}')).trim();
    return inner.split(',').map(part => {
      part = part.trim();
      if (part.includes(':')) {
        return part.split(':')[1].trim(); // take the alias
      }
      return part;
    }).filter(Boolean);
  }
  return [s];
}

function transformFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  // Find indices of top-level await import lines and adjacent top-level new()
  // We detect "top-level" as lines that are NOT indented (start of line, no leading spaces)
  const toMove = []; // { index, kind: 'import'|'new', original, letDecl, bodyLine }

  // First pass: find all top-level await import lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip indented lines
    if (/^\s/.test(line) && line.trim() !== '') continue;

    const mImport = TOP_AWAIT_IMPORT.exec(line);
    if (mImport) {
      const lhs = mImport[2]; // e.g. "{ default: fetch }" or "{ X, Y }"
      const varNames = extractVarNames(lhs);
      const letDecls = varNames.map(v => `let ${v}: any;`);

      // Reconstruct body line: change "const { x } = await" to "({ x } = await" etc.
      let bodyLine;
      const lhsTrimmed = lhs.trim();
      if (lhsTrimmed.startsWith('{')) {
        // destructuring: ({ X, Y } = await import('...'));
        bodyLine = `    (${lhsTrimmed} = await import(${mImport[3]}));`;
      } else {
        // plain assignment: X = await import('...');
        bodyLine = `    ${lhsTrimmed} = await import(${mImport[3]});`;
      }

      toMove.push({ index: i, kind: 'import', original: line, letDecls, bodyLine });
      continue;
    }
  }

  if (toMove.length === 0) {
    console.log(`  SKIP (no top-level await import): ${filePath}`);
    return false;
  }

  // Second pass: look for adjacent top-level `const x = new Class()`
  // right after the last import line (allow blank lines between)
  const importIndices = new Set(toMove.map(m => m.index));
  const lastImportIdx = Math.max(...toMove.map(m => m.index));

  for (let i = lastImportIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // blank line, keep looking
    if (/^\s/.test(line)) break; // indented = inside something, stop
    const mNew = TOP_NEW.exec(line);
    if (mNew) {
      const varName = mNew[2];
      const bodyLine = `    ${varName} = new ${mNew[3]}(${mNew[4]});`;
      toMove.push({ index: i, kind: 'new', original: line, letDecls: [`let ${varName}: any;`], bodyLine });
    } else {
      break; // Non-matching top-level line, stop scanning
    }
  }

  // Sort by index
  toMove.sort((a, b) => a.index - b.index);

  // Check if beforeAll already exists (we'll add to it or create new one)
  const hasBeforeAll = src.includes('beforeAll(async');

  if (hasBeforeAll) {
    console.log(`  NOTE: ${filePath} already has beforeAll — manual fix needed`);
    return false;
  }

  // Build new file
  const movingIndices = new Set(toMove.map(m => m.index));
  const letDecls = toMove.flatMap(m => m.letDecls);
  const bodyLines = toMove.map(m => m.bodyLine);

  // Ensure 'beforeAll' is imported
  let newLines = [];
  let importFixed = false;
  let beforeAllInserted = false;
  let lastMovedIdx = Math.max(...toMove.map(m => m.index));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fix the @jest/globals import to include beforeAll
    if (!importFixed && /from '@jest\/globals'/.test(line)) {
      if (!line.includes('beforeAll')) {
        newLines.push(line.replace(/from '@jest\/globals'/, "beforeAll } from '@jest/globals'").replace(/\{\s*/, '{ ').replace(/,\s*beforeAll\s*\}/, ', beforeAll }').replace(/\{\s*beforeAll/, '{ beforeAll'));
        // Actually just do a simple replacement
        newLines[newLines.length - 1] = line.replace(
          /import\s*\{([^}]+)\}\s*from\s*'@jest\/globals'/,
          (_, imports) => {
            const parts = imports.split(',').map(s => s.trim()).filter(Boolean);
            if (!parts.includes('beforeAll')) parts.push('beforeAll');
            return `import { ${parts.join(', ')} } from '@jest/globals'`;
          }
        );
      } else {
        newLines.push(line);
      }
      importFixed = true;
      continue;
    }

    if (movingIndices.has(i)) {
      // Skip this line (will be replaced by let decl + beforeAll)
      // If this is the first moved line, insert the let decls
      if (i === toMove[0].index) {
        for (const decl of [...new Set(letDecls)]) {
          newLines.push(decl);
        }
      }
      continue;
    }

    newLines.push(line);

    // After the last moved line's position, insert beforeAll
    // We insert after the let decls we just added (after the group of moved lines)
    if (!beforeAllInserted && i === lastMovedIdx - 1) {
      // We're right before/after the last moved line
    }
  }

  // Insert beforeAll after the let decls (which replaced the moved lines)
  // Find where the let decls are in newLines
  const firstLetDeclLine = [...new Set(letDecls)][0];
  const letDeclIdx = newLines.findIndex(l => l === firstLetDeclLine);
  if (letDeclIdx >= 0) {
    const lastLetDeclIdx = letDeclIdx + [...new Set(letDecls)].length - 1;
    const beforeAllBlock = [
      '',
      'beforeAll(async () => {',
      ...bodyLines,
      '});',
    ];
    newLines.splice(lastLetDeclIdx + 1, 0, ...beforeAllBlock);
  }

  const result = newLines.join('\n');
  fs.writeFileSync(filePath, result, 'utf8');
  console.log(`  FIXED: ${filePath} (moved ${toMove.length} lines to beforeAll)`);
  return true;
}

let fixed = 0;
for (const f of FILES) {
  try {
    if (transformFile(f)) fixed++;
  } catch (e) {
    console.error(`  ERROR in ${f}:`, e.message);
  }
}
console.log(`\nDone. Fixed ${fixed}/${FILES.length} files.`);
