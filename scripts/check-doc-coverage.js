const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const DEFAULT_ENTRY_POINT = path.join(repoRoot, 'src/index.ts');
const DEFAULT_API_DOC = path.join(repoRoot, 'docs/API.md');
const DEFAULT_BASELINE = path.join(__dirname, 'doc-coverage-baseline.json');

// Surface clients that must be documented regardless of the baseline.
const CORE_TARGETS = ['MultiSigEscrowClient', 'TrustFlowClient'];

// `export class|function|const|...` declarations, e.g. `export const enum Foo`.
const DECLARATION_PATTERN =
    /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?|const\s+enum|const|let|var|enum|interface|type|namespace)\s+([A-Za-z_$][\w$]*)/g;
// `export { A, B as C, type D }` with or without a `from` clause.
const NAMED_EXPORT_PATTERN = /export\s+(?:type\s+)?\{([^}]*)\}/g;
// `export * from './x'` and `export * as ns from './x'`.
const STAR_EXPORT_PATTERN = /export\s+\*(?:\s+as\s+([A-Za-z_$][\w$]*))?\s+from\s*['"]([^'"]+)['"]/g;

/** Drops block and line comments so commented-out exports are not counted. */
function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Resolves a relative `export * from` specifier to the file it names. */
function resolveReExport(fromFile, specifier) {
    const relativeFrom = path.relative(repoRoot, fromFile);
    if (!specifier.startsWith('.')) {
        throw new Error(`Cannot follow non-relative re-export '${specifier}' in ${relativeFrom}`);
    }
    const base = path.resolve(path.dirname(fromFile), specifier);
    const target = [`${base}.ts`, path.join(base, 'index.ts')].find((candidate) =>
        fs.existsSync(candidate),
    );
    if (!target) {
        throw new Error(`Cannot resolve re-export '${specifier}' from ${relativeFrom}`);
    }
    return target;
}

/** Turns the inside of `{ A, B as C, type D }` into the exported names `A, C, D`. */
function parseNamedList(list) {
    return list
        .split(',')
        .map((entry) => entry.trim().replace(/^type\s+/, ''))
        .filter(Boolean)
        .map((entry) => entry.split(/\s+as\s+/).pop().trim());
}

/**
 * Collects every name a module exposes, following `export *` re-exports into
 * the modules they point at. `default` is never a public symbol here.
 */
function collectExports(file, visited = new Set()) {
    const resolved = path.resolve(file);
    const names = new Set();
    if (visited.has(resolved)) return names;
    visited.add(resolved);

    const source = stripComments(fs.readFileSync(resolved, 'utf8'));

    for (const [, name] of source.matchAll(DECLARATION_PATTERN)) names.add(name);
    for (const [, list] of source.matchAll(NAMED_EXPORT_PATTERN)) {
        for (const name of parseNamedList(list)) names.add(name);
    }
    for (const [, alias, specifier] of source.matchAll(STAR_EXPORT_PATTERN)) {
        if (alias) {
            names.add(alias);
            continue;
        }
        for (const name of collectExports(resolveReExport(resolved, specifier), visited)) {
            names.add(name);
        }
    }

    names.delete('default');
    return names;
}

/** True when `symbol` appears in the docs as a whole identifier (case-sensitive). */
function isDocumented(symbol, docContent) {
    const escaped = symbol.replace(/\$/g, '\\$');
    return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(docContent);
}

function readBaseline(baselinePath) {
    if (!fs.existsSync(baselinePath)) return new Set();
    return new Set(JSON.parse(fs.readFileSync(baselinePath, 'utf8')).undocumented);
}

/**
 * Compares the public surface against the API docs.
 *
 * `failures` are undocumented symbols that are not in the baseline (or are core
 * targets), so they fail the check. `undocumented` is every non-core gap today,
 * used to regenerate the baseline. `stale` lists baseline entries that are now
 * documented or no longer exported.
 */
function checkDocCoverage({
    entryPoint = DEFAULT_ENTRY_POINT,
    apiDoc = DEFAULT_API_DOC,
    baselinePath = DEFAULT_BASELINE,
} = {}) {
    const docContent = fs.readFileSync(apiDoc, 'utf8');
    const exported = collectExports(entryPoint);
    CORE_TARGETS.forEach((target) => exported.add(target));

    const undocumented = [...exported].filter((symbol) => !isDocumented(symbol, docContent)).sort();
    const baseline = readBaseline(baselinePath);
    const failures = undocumented.filter(
        (symbol) => CORE_TARGETS.includes(symbol) || !baseline.has(symbol),
    );
    const stale = [...baseline].filter((symbol) => !undocumented.includes(symbol)).sort();

    return {
        undocumented: undocumented.filter((symbol) => !CORE_TARGETS.includes(symbol)),
        failures,
        stale,
    };
}

function main(argv = process.argv.slice(2)) {
    if (!fs.existsSync(DEFAULT_API_DOC) || !fs.existsSync(DEFAULT_ENTRY_POINT)) {
        console.log('Skipping verification: Required asset tracks are not generated locally yet.');
        return 0;
    }

    if (argv.includes('--update-baseline')) {
        const { undocumented } = checkDocCoverage();
        fs.writeFileSync(
            DEFAULT_BASELINE,
            `${JSON.stringify({ undocumented }, null, 2)}\n`,
        );
        console.log(`Wrote ${undocumented.length} undocumented symbol(s) to ${DEFAULT_BASELINE}`);
        return 0;
    }

    console.log('🔍 Running TrustFlow SDK public surface documentation drift checks...');
    const { failures, stale } = checkDocCoverage();

    for (const symbol of failures) {
        console.error(`❌ Drift Detected: '${symbol}' is exported publicly from src/index.ts but missing from docs/API.md!`);
    }
    if (stale.length > 0) {
        console.log(
            `ℹ️ ${stale.length} baseline entr${stale.length === 1 ? 'y is' : 'ies are'} now documented or no longer exported (${stale.join(', ')}). Run "node scripts/check-doc-coverage.js --update-baseline" to prune.`,
        );
    }

    if (failures.length > 0) {
        console.error('📊 Documentation sync check failed. Please document missing components inside docs/API.md.');
        return 1;
    }
    console.log('✅ Documentation synchronization surface check passed successfully!');
    return 0;
}

if (require.main === module) {
    process.exitCode = main();
}

module.exports = { collectExports, checkDocCoverage, isDocumented, main };
