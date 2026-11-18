// Portfolio screenshots: node tools/shots.mjs [base URL]
// Signs in as the fictional seed account (prisma/seed.ts) on a local server, e.g.
//   npm run db:local & npm run db:seed && NEXT_DIST_DIR=.next-build npm run build && NEXT_DIST_DIR=.next-build npx next start -p 3311
import fs from 'node:fs';
import path from 'node:path';
import { capture } from './shots-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = process.argv[2] || 'http://localhost:3311';
const seed = fs.readFileSync(path.join(ROOT, 'prisma/seed.ts'), 'utf8');
const email = seed.match(/DEMO_EMAIL = "([^"]+)"/)[1], password = seed.match(/DEMO_PASSWORD = "([^"]+)"/)[1];
const signIn = `fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify({ email, password })}) }).then(r => r.status)`;
await capture(ROOT, {
  scheme: 'light',
  phone: [
    { url: `${BASE}/login`, file: '_signin', wait: 3000, js: signIn },
    { url: `${BASE}/overview`, file: 'overview', wait: 6000 },
    { url: `${BASE}/tasks`, file: 'tasks', wait: 5000 },
    { url: `${BASE}/habits`, file: 'habits', wait: 5000 },
    { url: `${BASE}/calendar`, file: 'calendar', wait: 5000 },
  ],
  desktop: { url: `${BASE}/overview`, wait: 6000 },
});
fs.rmSync(path.join(ROOT, 'prototype/shots/_signin.jpg'), { force: true });
