#!/usr/bin/env node
// Puerta de dependencias (política: docs/security/vulnerabilidades.md).
// Se ejecuta desde backend/ o frontend/:  node ../scripts/audit-gate.mjs
//
// - CRITICAL: siempre bloquea.
// - HIGH: bloquea salvo excepción registrada en security/audit-exceptions.json
//   para esta app, con fecha límite vigente. Una excepción vencida bloquea.
// - Avisa de excepciones que ya no hacen falta, para retirarlas.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = basename(process.cwd());
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { exceptions } = JSON.parse(readFileSync(join(root, 'security/audit-exceptions.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

let report;
try {
  report = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (error) {
  report = error.stdout; // npm audit sale con código ≠ 0 cuando encuentra algo
}
const vulnerabilities = JSON.parse(report).vulnerabilities ?? {};

// Cada advisory aparece en el paquete afectado como objeto dentro de `via`.
const advisories = new Map();
for (const [pkg, vuln] of Object.entries(vulnerabilities)) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object') continue;
    const id = via.url?.split('/').pop() ?? String(via.source);
    advisories.set(id, { id, pkg, severity: via.severity, title: via.title });
  }
}

const failures = [];
const used = new Set();
for (const advisory of advisories.values()) {
  if (advisory.severity === 'critical') {
    failures.push(`CRITICAL ${advisory.id} (${advisory.pkg}): ${advisory.title} — no admite excepción`);
  } else if (advisory.severity === 'high') {
    const exception = exceptions.find((e) => e.id === advisory.id && e.app === app);
    if (!exception) failures.push(`HIGH ${advisory.id} (${advisory.pkg}): ${advisory.title} — corregir o registrar una excepción fechada`);
    else if (exception.expires < today) failures.push(`HIGH ${advisory.id} (${advisory.pkg}): la excepción venció el ${exception.expires}`);
    else {
      used.add(exception.id);
      console.log(`Aceptado temporalmente hasta ${exception.expires}: ${advisory.id} (${advisory.pkg}) — ${exception.exposure}`);
    }
  }
}

for (const stale of exceptions.filter((e) => e.app === app && !used.has(e.id))) {
  console.log(`Aviso: la excepción ${stale.id} ya no hace falta en ${app}; retírala de security/audit-exceptions.json.`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`${app}: sin vulnerabilidades CRITICAL ni HIGH sin excepción vigente.`);
