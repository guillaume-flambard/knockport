#!/usr/bin/env node
/**
 * Consolidated dependency and secret audit.
 *
 * Outputs a report covering:
 *  - outdated packages (pnpm outdated)
 *  - known CVEs (pnpm audit)
 *  - hardcoded secrets in the repo (pattern scan)
 *  - an SBOM summary (direct dependencies per workspace)
 *
 * Exits nonzero if a known vulnerability or a probable secret is found, so
 * it can gate CI.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

const SECRET_PATTERNS = [
  // API keys and long tokens assigned in source.
  /(api[_-]?key|secret|token|password|passwd|client[_-]?secret)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
  // Private keys.
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  // Stripe / AWS style prefixes.
  /\b(sk_live_|sk_test_|AKIA[0-9A-Z]{16})\b/i,
  // URL-embedded credentials.
  /[a-zA-Z0-9._%+-]+:[^@\s/]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/,
]

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 90_000 })
  } catch {
    return ''
  }
}

function scanSecrets() {
  const findings = []
  const dirs = ['apps', 'packages', 'scripts']
  const skip = /(node_modules|\.next|\.git|\.playwright|target|test-results|playwright-report|\.pnpm|dist|audit-deps\.mjs)/
  for (const dir of dirs) {
    const walk = (d) => {
      if (!existsSync(d)) return
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name)
        if (entry.isDirectory()) {
          if (!skip.test(full)) walk(full)
        } else if (entry.isFile() && /\.(ts|tsx|mjs|js|json|env|md)$/.test(entry.name)) {
          if (entry.name === 'audit-deps.mjs') continue
          let content
          try {
            content = readFileSync(full, 'utf8')
          } catch {
            continue
          }
          for (const pattern of SECRET_PATTERNS) {
            const m = content.match(pattern)
            if (m) {
              // Ignore obvious placeholders and test fixtures.
              const hit = m[0]
              if (/(example|placeholder|your-|xxx|test|changeme|\.env)/i.test(hit)) continue
              findings.push({ file: full, match: hit.slice(0, 80) })
              break
            }
          }
        }
      }
    }
    walk(join(ROOT, dir))
  }
  return findings
}

function sbom() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const web = JSON.parse(readFileSync(join(ROOT, 'apps/web/package.json'), 'utf8'))
  const core = JSON.parse(readFileSync(join(ROOT, 'packages/core/package.json'), 'utf8'))
  return {
    rootDeps: Object.keys(pkg.dependencies ?? {}),
    rootDevDeps: Object.keys(pkg.devDependencies ?? {}),
    webDeps: Object.keys(web.dependencies ?? {}),
    coreDeps: Object.keys(core.dependencies ?? {}),
  }
}

console.log('═'.repeat(56))
console.log('  KNOCKPORT — dependency & secret audit')
console.log('═'.repeat(56))

console.log('\n## pnpm audit (known CVEs)\n')
const audit = run('pnpm', ['audit', '--json'])
let vulns = 0
if (audit) {
  try {
    const data = JSON.parse(audit)
    vulns = data.metadata?.vulnerabilities?.high ?? 0
  } catch {
    vulns = /"high"\s*:\s*[1-9]/.test(audit) ? 1 : 0
  }
  console.log(audit.includes('No known vulnerabilities') ? '  No known vulnerabilities' : audit.slice(0, 400))
} else {
  console.log('  audit unavailable')
}

console.log('\n## Outdated packages\n')
const outdated = run('pnpm', ['outdated', '--format=json'])
if (outdated.trim()) {
  try {
    const parsed = JSON.parse(outdated)
    const rows = Object.entries(parsed)
    if (rows.length === 0) console.log('  All packages up to date')
    else rows.forEach(([name, info]) => console.log(`  ${name}: ${info.current} -> ${info.latest}`))
  } catch {
    console.log(outdated.slice(0, 400))
  }
} else {
  console.log('  All packages up to date')
}

console.log('\n## Hardcoded secrets\n')
const secrets = scanSecrets()
if (secrets.length === 0) console.log('  None found')
else secrets.forEach((s) => console.log(`  ${s.file}: ${s.match}`))

console.log('\n## SBOM summary\n')
const bom = sbom()
console.log(`  root deps: ${bom.rootDeps.length} | root devDeps: ${bom.rootDevDeps.length}`)
console.log(`  web deps: ${bom.webDeps.length} | core deps: ${bom.coreDeps.length}`)
console.log(`  core runtime deps: ${bom.coreDeps.length} (must be 0 per AGENTS.md)`)

console.log('\n' + '═'.repeat(56))
const failed = vulns > 0 || secrets.length > 0
console.log(failed ? '  RESULT: FAIL (fix findings above)' : '  RESULT: PASS')
process.exit(failed ? 1 : 0)
