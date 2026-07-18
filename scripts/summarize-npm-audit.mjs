import { readFileSync } from 'node:fs';

const [reportPath = 'npm-audit.json'] = process.argv.slice(2);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const vulnerabilities = Object.values(report.vulnerabilities ?? {});
const metadata = report.metadata?.vulnerabilities ?? {};

const severityOrder = ['critical', 'high', 'moderate', 'low', 'info'];
const totals = severityOrder
  .map((severity) => `${severity}: ${metadata[severity] ?? 0}`)
  .join(', ');

const lines = [];
lines.push('## Dependency Vulnerability Scan');
lines.push('');
lines.push(`Audit severity threshold: **${process.env.AUDIT_LEVEL ?? 'high'}**`);
lines.push(`Vulnerability totals: ${totals}`);
lines.push('');

if (vulnerabilities.length === 0) {
  lines.push('No npm advisory vulnerabilities were reported.');
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(0);
}

lines.push('| Package | Severity | Direct | Fix available | Via |');
lines.push('|---|---:|:---:|---|---|');

for (const vulnerability of vulnerabilities
  .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
  .slice(0, 25)) {
  const via = (vulnerability.via ?? [])
    .map((entry) => (typeof entry === 'string' ? entry : entry.title ?? entry.source ?? 'advisory'))
    .slice(0, 3)
    .join('<br>');
  const fix = vulnerability.fixAvailable
    ? typeof vulnerability.fixAvailable === 'object'
      ? `${vulnerability.fixAvailable.name}@${vulnerability.fixAvailable.version}`
      : 'yes'
    : 'no';
  lines.push(
    `| ${vulnerability.name} | ${vulnerability.severity} | ${vulnerability.isDirect ? 'yes' : 'no'} | ${fix} | ${via} |`,
  );
}

if (vulnerabilities.length > 25) {
  lines.push('');
  lines.push(`Showing 25 of ${vulnerabilities.length} vulnerable packages. Download the npm audit artifact for full details.`);
}

process.stdout.write(`${lines.join('\n')}\n`);
