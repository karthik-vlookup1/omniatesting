// Applies the recon-601 feature (LetMC-style frontend) to the protected hx feature list.
// Run once from the repo root:  node .claude/approvals/recon-601/apply.cjs
// Safe to re-run: it does nothing if recon-601 already exists. Writes UTF-8 without a BOM.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const listPath = path.join(root, '.claude', 'state', 'feature_list.json');
const contractPath = path.join(root, '.claude', 'state', 'contracts', 'feature-recon-601.md');

const feature = {
  id: 'recon-601',
  priority: 1101,
  area: 'phase-6-frontend',
  title:
    'LetMC-style frontend: top-bar modules (Dashboard, Lettings, Accounts, Office), global tenant search with open-record tabs, tenant record (overview cards, tenant-details tabs, actions menu), every existing screen restyled to one design system on the real API',
  user_visible_behavior:
    'Staff who know LetMC find the same structure: search a TID or name, open the tenant record, see balances and rent chase, run accounting actions from the Actions menu, and reach every Recon screen from the top-bar modules.',
  scope: ['web/src/**', 'web/index.html', 'e2e/**', 'plans/recon-601.md', 'docs/FRONTEND.md', 'docs/FRONTEND_REFERENCE.md'],
  verification: [
    { level: 'unit', cmd: 'npm run lint' },
    { level: 'unit', cmd: 'npm run typecheck' },
    { level: 'unit', cmd: 'npm run test:web' },
  ],
  status: 'not_started',
  evidence: [],
  notes: 'HARD. Plan and progress log: plans/recon-601.md. Frontend only; no server/db changes.',
  dependsOn: ['recon-509'],
};

const contract = `# Sprint Contract: ${feature.title}

## Scope

${feature.scope.map((s) => `- ${s}`).join('\n')}

## Verification Standards

- [unit] \`npm run lint\`
- [unit] \`npm run typecheck\`
- [unit] \`npm run test:web\`
- Every screen uses the real API (no mock data in the normal app); roles gate actions; each screen checked in a browser.

## Exclusions

- server/**
- db/**
- package.json
- package-lock.json
- web/package.json
- web/tsconfig*.json
- docker-compose.yml
- .github/**
`;

const list = JSON.parse(fs.readFileSync(listPath, 'utf8').replace(/^﻿/, ''));
if (list.features.some((f) => f.id === feature.id)) {
  console.log('recon-601 already present; nothing to do.');
} else {
  list.features.push(feature);
  fs.writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log('added recon-601 to feature_list.json');
}
if (!fs.existsSync(contractPath)) {
  fs.writeFileSync(contractPath, contract, 'utf8');
  console.log('wrote contracts/feature-recon-601.md');
}
