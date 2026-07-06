#!/usr/bin/env node
// E2 guardrail: compare locale catalogs against the source locale (en).
//   key in en but missing from a target locale  -> WARN  (graceful English fallback)
//   key in a target locale but missing from en  -> ERROR (en is the source; this is drift/typo)
//   namespace file present in one locale only    -> ERROR
// Exit 1 on any error so CI fails; warnings never fail the build.
// ponytail: compares catalogs only, doesn't scan t() calls — add that scan if untranslated
//   keys start slipping through despite catalogs being in sync.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE = 'en';
const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, key) : [key];
  });

const nsKeys = (locale) => {
  const dir = join(localesDir, locale);
  const map = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    map[file.replace(/\.json$/, '')] = new Set(flatten(JSON.parse(readFileSync(join(dir, file), 'utf8'))));
  }
  return map;
};

const locales = readdirSync(localesDir).filter((l) => l !== SOURCE);
const source = nsKeys(SOURCE);
let errors = 0;
let warnings = 0;

for (const locale of locales) {
  const target = nsKeys(locale);

  for (const ns of Object.keys(source)) {
    if (!(ns in target)) {
      console.error(`ERROR  [${locale}] missing namespace file: ${ns}.json`);
      errors++;
      continue;
    }
    for (const key of source[ns]) {
      if (!target[ns].has(key)) {
        console.warn(`WARN   [${locale}] ${ns}: missing key "${key}" (falls back to ${SOURCE})`);
        warnings++;
      }
    }
  }

  for (const ns of Object.keys(target)) {
    if (!(ns in source)) {
      console.error(`ERROR  [${locale}] orphan namespace file (no ${SOURCE} source): ${ns}.json`);
      errors++;
      continue;
    }
    for (const key of target[ns]) {
      if (!source[ns].has(key)) {
        console.error(`ERROR  [${locale}] ${ns}: orphan key "${key}" — no matching ${SOURCE} source`);
        errors++;
      }
    }
  }
}

console.log(`\ni18n check: ${errors} error(s), ${warnings} warning(s) across ${locales.length} target locale(s).`);
process.exit(errors > 0 ? 1 : 0);
