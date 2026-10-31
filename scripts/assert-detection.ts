import { appendFileSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

interface JsonSpec {
  title: string;
  ok: boolean;
  tags: string[];
  tests: { status: string }[];
}

interface JsonSuite {
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}

interface CategoryResult {
  total: number;
  failed: number;
  failedTitles: string[];
}

const CATEGORIES = Array.from({ length: 10 }, (_, index) => `API${index + 1}`);
const CATEGORY_NAMES: Record<string, string> = {
  API1: 'Broken Object Level Authorization',
  API2: 'Broken Authentication',
  API3: 'Broken Object Property Level Authorization',
  API4: 'Unrestricted Resource Consumption',
  API5: 'Broken Function Level Authorization',
  API6: 'Unrestricted Access to Sensitive Business Flows',
  API7: 'Server Side Request Forgery',
  API8: 'Security Misconfiguration',
  API9: 'Improper Inventory Management',
  API10: 'Unsafe Consumption of APIs',
};

const { values } = parseArgs({
  options: {
    mode: { type: 'string' },
    report: { type: 'string', default: 'test-results/results.json' },
  },
});
const mode = values.mode;
if (mode !== 'hardened' && mode !== 'vulnerable') {
  console.error('Usage: assert-detection --mode hardened|vulnerable [--report path]');
  process.exit(2);
}

const report = JSON.parse(readFileSync(values.report, 'utf8')) as { suites: JsonSuite[] };

function* walk(suites: JsonSuite[]): Generator<JsonSpec> {
  for (const suite of suites) {
    yield* suite.specs ?? [];
    yield* walk(suite.suites ?? []);
  }
}

const results = new Map<string, CategoryResult>(CATEGORIES.map((category) => [category, { total: 0, failed: 0, failedTitles: [] }]));
const untagged: string[] = [];

for (const spec of walk(report.suites)) {
  const category = spec.tags.map((tag) => tag.replace(/^@/, '')).find((tag) => results.has(tag));
  if (!category) {
    untagged.push(spec.title);
    continue;
  }
  const result = results.get(category) as CategoryResult;
  result.total += 1;
  if (!spec.ok) {
    result.failed += 1;
    result.failedTitles.push(spec.title);
  }
}

const problems: string[] = [];
if (untagged.length > 0) problems.push(`Tests without an OWASP category tag: ${untagged.join('; ')}`);

const rows = CATEGORIES.map((category) => {
  const { total, failed } = results.get(category) as CategoryResult;
  let verdict: string;
  if (total === 0) {
    verdict = 'NO TESTS';
    problems.push(`${category} has no tests`);
  } else if (mode === 'vulnerable') {
    verdict = failed > 0 ? 'DETECTED' : 'MISSED';
    if (failed === 0) problems.push(`${category} seeded flaw was not detected by any test`);
  } else {
    verdict = failed === 0 ? 'SECURE' : 'FAILING';
    if (failed > 0) problems.push(`${category} has ${failed} failing test(s) against the hardened target`);
  }
  return `| ${category} | ${CATEGORY_NAMES[category]} | ${total} | ${failed} | ${verdict} |`;
});

const heading =
  mode === 'vulnerable'
    ? '### Vulnerable target: every OWASP category must be detected'
    : '### Hardened target: every OWASP category must pass';
const summary = [heading, '', '| Category | Name | Tests | Failed | Verdict |', '| --- | --- | ---: | ---: | --- |', ...rows, ''].join('\n');

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

if (mode === 'vulnerable') {
  for (const category of CATEGORIES) {
    const { failedTitles } = results.get(category) as CategoryResult;
    if (failedTitles.length > 0) console.log(`${category} detections:\n  - ${failedTitles.join('\n  - ')}`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(mode === 'vulnerable' ? 'All 10 categories detected.' : 'All 10 categories secure.');
