/**
 * Copies static assets into .next/standalone so the production server can serve them.
 * Must run after `next build` and before `electron-builder`.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function copyDir(src, dst) {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
    }
    return true;
}

const jobs = [
    {
        src: path.join(root, '.next', 'static'),
        dst: path.join(root, '.next', 'standalone', '.next', 'static'),
        label: '.next/static → .next/standalone/.next/static',
    },
    {
        src: path.join(root, 'public'),
        dst: path.join(root, '.next', 'standalone', 'public'),
        label: 'public → .next/standalone/public',
    },
];

let ok = true;
for (const { src, dst, label } of jobs) {
    if (copyDir(src, dst)) {
        console.log(`  ✓  ${label}`);
    } else {
        console.warn(`  ⚠  Skipped (source not found): ${label}`);
        ok = false;
    }
}

if (!ok) {
    console.error('\nRun "npm run build" first.');
    process.exit(1);
}
