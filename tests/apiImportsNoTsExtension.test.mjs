// Guarda estrutural: nenhum arquivo em api/ pode importar um módulo local com
// extensão .ts explícita. O build da Vercel (@vercel/node) transpila cada
// arquivo .ts rastreado para um .js correspondente SEM reescrever os
// especificadores de import — então um import "./foo.ts" sobrevive no bundle
// compilado, mas só existe "foo.js" nele, e o carregamento da function falha
// em runtime. Todo o resto de api/ já usa ".js" para importar módulos irmãos
// (incluindo os que vêm de src/lib) — esse é o único estilo seguro ali.
//
// Rodar:  node --test tests/apiImportsNoTsExtension.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "api");

function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

test("no file under api/ imports a local module with an explicit .ts extension", () => {
  const offenders = [];
  for (const file of listTsFiles(API_DIR)) {
    const content = readFileSync(file, "utf8");
    const matches = content.match(/from\s+["'][^"']*\.ts["']/g) ?? [];
    if (matches.length) offenders.push(`${path.relative(API_DIR, file)}: ${matches.join(", ")}`);
  }
  assert.deepEqual(offenders, []);
});
