/* Two applications that do the same job must be named in every place the
 * reader could choose them, and named consistently.
 *
 * Selecting both pfetch and fastfetch is allowed - it is somebody's choice -
 * and it is far more often somebody working down a list of checkboxes who has
 * not noticed the overlap, and who finds out when two greetings appear at
 * every shell. Same with two file managers, where only one can be the handler
 * that opens a folder.
 *
 * Three places tell the reader about it: the generator's smart analysis, the
 * walkthrough's note on the same question, and a wiki section. This gate is
 * what stops those three drifting, and what stops the table naming an
 * application that no longer exists as an option - which would be a warning
 * that can never fire, indistinguishable from one that works.
 */
import fs from 'node:fs';
import path from 'node:path';

const WEB = process.argv[2] || '../website';
const read = f => fs.readFileSync(path.join(WEB, f), 'utf8');

let checks = 0;
const failures = [];
const ok = (cond, label) => { checks++; if (!cond) failures.push(label); };

const sandbox = { window: {}, module: undefined };
const { STEPS, w } = new Function('window', 'module',
    read('os-meta.js') + '\n' + read('os-install.js') + '\n' + read('manual-data.js') +
    '\nreturn { STEPS, w: window };')(sandbox.window, undefined);

const GROUPS = w.APP_OVERLAP;
ok(Array.isArray(GROUPS) && GROUPS.length > 0,
   'os-install.js exposes no APP_OVERLAP table, so nothing could be checked');
if (!GROUPS) { console.error('app-overlap: no table'); process.exit(1); }

/* ── 1. Every member is a real option in both front ends ──────────────────
   A group naming an application neither form offers is a warning that can
   never fire. It reads as coverage and is not. */
const appsStep = STEPS.find(s => s.id === 'apps');
ok(!!appsStep, 'the walkthrough has no `apps` question, so the note has nowhere to appear');
const walkthroughApps = new Set((appsStep?.options || []).map(o => o.value));

const generatorHtml = read('index.html');
const generatorApps = new Set(
    [...generatorHtml.matchAll(/name="post_apps"\s+value="([^"]+)"/g)].map(m => m[1]));
ok(generatorApps.size > 5,
   `only ${generatorApps.size} post-install applications found in index.html, which is ` +
   `too few to be the real list - the match is probably wrong`);

for (const g of GROUPS) {
    ok(g.members.length > 1, `overlap group '${g.id}' has fewer than two members`);
    for (const m of g.members) {
        ok(generatorApps.has(m),
           `overlap group '${g.id}' names '${m}', which the generator does not offer, ` +
           `so that half of the warning can never fire`);
        ok(walkthroughApps.has(m),
           `overlap group '${g.id}' names '${m}', which the walkthrough does not offer`);
    }
    /* Every member needs its own line, or the reader is told two things
       overlap and only what one of them is. */
    for (const m of g.members) {
        ok(typeof g.compare[m] === 'string' && g.compare[m].length > 30,
           `overlap group '${g.id}' does not say what '${m}' actually is, so the ` +
           `warning names a conflict without giving the reader anything to decide with`);
    }
    ok(typeof g.note === 'string' && g.note.length > 20,
       `overlap group '${g.id}' has no note explaining why picking both matters`);
}

/* ── 2. The wiki section each group promises exists ───────────────────────── */
const wikiHtml = read('wiki.html');
for (const g of GROUPS) {
    if (!g.wiki) continue;
    ok(new RegExp(`id="${g.wiki}"`).test(wikiHtml),
       `overlap group '${g.id}' points at wiki anchor '#${g.wiki}', which wiki.html ` +
       `does not define - the link resolves to nothing`);
}

/* ── 3. Both front ends actually consult the table ────────────────────────
   The table existing is not the feature. Being read is. */
ok(/appOverlaps/.test(read('script.js')),
   'the generator never calls appOverlaps(), so no smart-analysis notice is produced');
ok(/appOverlaps/.test(read('manual-data.js')),
   'the walkthrough never calls appOverlaps(), so the two front ends disagree about ' +
   'whether an overlap is worth mentioning');

/* ── 4. The notice fires, and only when it should ─────────────────────────── */
globalThis.window = w;
for (const g of GROUPS) {
    const one = w.appOverlaps([g.members[0]]);
    ok(one.length === 0,
       `selecting only '${g.members[0]}' reported an overlap, so the notice fires on a ` +
       `single choice and becomes noise`);
    const all = w.appOverlaps(g.members);
    ok(all.length === 1,
       `selecting every member of '${g.id}' reported ${all.length} overlaps, expected 1`);
    const text = w.appOverlapText(all[0]).join(' ');
    for (const m of g.members) {
        ok(text.includes(m),
           `the notice for '${g.id}' does not mention '${m}', so the reader cannot tell ` +
           `which selections it means`);
    }
}
ok(w.appOverlaps([]).length === 0, 'an empty selection reported an overlap');

/* ── 5. The tooltip where the choice is made says it too ──────────────────
   A reader who never opens the wiki and never trips the smart analysis still
   has to be able to find out, at the checkbox. */
for (const g of GROUPS) {
    for (const m of g.members) {
        const others = g.members.filter(x => x !== m);
        const card = generatorHtml.split(`value="${m}"`)[1] || '';
        const window_ = card.slice(0, 1200);
        ok(others.some(o => new RegExp(o, 'i').test(window_)),
           `the '${m}' tooltip in index.html does not mention ${others.join(' or ')}, so ` +
           `the comparison is only visible to a reader who already selected both`);
    }
}

if (failures.length) {
    console.error(`app-overlap: ${failures.length} of ${checks} checks failed\n`);
    failures.forEach(f => console.error('  FAIL  ' + f));
    process.exit(1);
}
console.log(`app-overlap: ${checks} checks across ${GROUPS.length} overlapping groups ` +
            `(${GROUPS.map(g => g.members.join('/')).join(', ')}), 0 failed`);
