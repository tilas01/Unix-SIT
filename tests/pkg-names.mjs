/* Every system that renames packages must rename the same set of them.
 *
 * `osPkgName()` returns the Arch name when a system's table has no entry for
 * it. That is the right default for a system whose names genuinely match
 * Arch's, and it is a silent defect for one whose names do not: a package
 * missing from the Raspberry Pi table does not throw and does not blank, it
 * arrives in the emitted command as the Arch spelling, so the reader is handed
 * `apt-get install networkmanager` and finds out at the terminal.
 *
 * Nothing else notices. The leakage gates count foreign *tools* — pacstrap,
 * emerge, pkg_add — and an Arch package name inside a correct apt command is
 * not one of those. Neither `bash -n` nor shellcheck has an opinion about
 * whether a package exists.
 *
 * So the tables are held to the same key set. Adding a name for one system and
 * forgetting the others is the failure this catches, and it is the failure that
 * happens, because the tables are long and are edited one system at a time.
 *
 * A second check runs the other way: an entry for a package no emitter can ever
 * ask about is dead weight that reads as coverage. Both directions matter,
 * because the whole point of the table is that its size means something.
 */
import fs from 'node:fs';
import path from 'node:path';

const WEB = process.argv[2] || '../website';
const read = f => fs.readFileSync(path.join(WEB, f), 'utf8');

let checks = 0;
const failures = [];
const ok = (cond, label) => { checks++; if (!cond) failures.push(label); };

const w = {};
new Function('window', read('os-meta.js') + '\n' + read('os-install.js'))(w);

const TABLES = w.OS_PKG_NAMES;
ok(TABLES && Object.keys(TABLES).length >= 2,
   'os-install.js exposed no package-name tables, so nothing was compared');
if (!TABLES) {
    console.error('pkg-names: OS_PKG_NAMES is not exported');
    process.exit(1);
}

const systems = Object.keys(TABLES);

/* ── 1. One key set, shared ────────────────────────────────────────────────
   The union is what the emitters can ask about; every table has to answer for
   all of it, with a name or with an explicit null. */
const union = new Set();
for (const os of systems) for (const k of Object.keys(TABLES[os])) union.add(k);

for (const os of systems) {
    const have = new Set(Object.keys(TABLES[os]));
    const missing = [...union].filter(k => !have.has(k)).sort();
    ok(missing.length === 0,
       `${os} has no entry for ${missing.length} package(s) another system ` +
       `translates, so each reaches its install command under the Arch name: ` +
       missing.join(', '));
}

/* ── 2. Values are plausible for the system they belong to ─────────────────
   Not a substitute for checking a real archive, which a test with no network
   cannot do. It catches the mistake that actually happens: an Arch name copied
   into another system's column and left there. */
const SHAPE = {
    // Portage atoms are category/name. A bare name is ambiguous to emerge and
    // is the one mistake this column keeps attracting.
    gentoo: {
        test: v => v.includes('/'),
        why: 'is not a category/name atom, and a bare name can match more than ' +
             'one package, so portage stops and asks rather than guessing'
    },
    // Debian names are lowercase, and may hold digits, dot, plus and hyphen.
    raspios: {
        test: v => /^[a-z0-9][a-z0-9.+-]*$/.test(v),
        why: 'is not a legal Debian binary package name'
    }
};

for (const os of systems) {
    const shape = SHAPE[os];
    if (!shape) continue;
    const wrong = Object.entries(TABLES[os])
        .filter(([, v]) => v !== null && !shape.test(v))
        .map(([k, v]) => `${k} -> ${v}`);
    ok(wrong.length === 0, `${os}: ${wrong.join(', ')} ${shape.why}`);
}

/* ── 3. No entry for a package nothing can ask about ───────────────────────
   A table that lists packages the emitters never mention looks like more
   coverage than it is. Searched across the two emitters and the question data,
   which is everywhere a package name can originate. */
const sources = ['manual-guide.js', 'manual-data.js', 'script.js'].map(read).join('\n');

/* Packages the application catalogue can emit. Taken from the parsed table
   rather than by searching os-install.js as text, which would let every entry
   vouch for itself and quietly turn this check off. */
const fromCatalogue = new Set();
for (const app of (w.APPS || [])) for (const pkg of app.pkgs) fromCatalogue.add(pkg);

for (const os of systems) {
    const dead = Object.keys(TABLES[os])
        .filter(k => !fromCatalogue.has(k))
        /* A whole-word search, because a package name reaches the output in
           more shapes than a quoted literal. `terminus-font` is spliced into a
           template string immediately before an escape, so a test matching on
           the punctuation around it reads as absent and is not. */
        .filter(k => !new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(sources))
        .sort();
    ok(dead.length === 0,
       `${os} translates ${dead.length} package(s) no emitter ever names, which ` +
       `reads as coverage and is not: ${dead.join(', ')}`);
}

/* ── 4. Nulls carry a reason ───────────────────────────────────────────────
   A null is a claim that the system has no equivalent, and an unexplained one
   is indistinguishable from an unfinished entry. Checked against the source
   text rather than the parsed table, because the reason lives in a comment. */
const src = read('os-install.js');

/* Each system's own block, so a name that appears in two tables is judged
   against the entry it belongs to. Searching the whole file finds whichever
   table is written first and reports its neighbours for everyone. */
function blockFor(os) {
    const start = src.indexOf(`\n        ${os}: {`);
    if (start === -1) return '';
    let depth = 0, i = src.indexOf('{', start);
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) return src.slice(start, j);
    }
    return src.slice(start);
}

for (const os of systems) {
    const lines = blockFor(os).split('\n');
    const nulls = Object.entries(TABLES[os]).filter(([, v]) => v === null).map(([k]) => k);
    const unexplained = nulls.filter(k => {
        const at = lines.findIndex(l => l.includes(`'${k}': null`));
        if (at === -1) return true;
        const isComment = l => /\/\/|\/\*|\*\/|^\s*\*/.test(l);
        if (isComment(lines[at])) return false;          // trailing on the line
        /* Walk up past the rest of the run. One comment introducing a group of
           unavailable packages explains all of them - the five UEFI entries on
           a board with no UEFI want one reason between them, not five copies.
           Only other null entries and blank lines may be stepped over, so a
           comment two groups up does not get to cover this one.

           Line-based on purpose: an earlier version measured the distance to
           the nearest comment marker and asked whether a `;` sat between, which
           a semicolon written inside the comment prose defeated. */
        for (let i = at - 1; i >= 0; i--) {
            const line = lines[i];
            if (isComment(line)) return false;
            if (/^\s*$/.test(line)) continue;
            if (/'[^']+':\s*null,?\s*$/.test(line)) continue;
            return true;
        }
        return true;
    });
    ok(unexplained.length === 0,
       `${os}: ${unexplained.join(', ')} declared unavailable with no reason given, ` +
       `which cannot be told apart from an entry somebody did not finish`);
}

const total = [...union].length;
if (failures.length) {
    console.error(`pkg-names: ${failures.length} of ${checks} checks failed\n`);
    failures.forEach(f => console.error('  FAIL  ' + f));
    process.exit(1);
}
console.log(`pkg-names: ${checks} checks across ${systems.length} systems ` +
            `and ${total} package names, 0 failed`);
