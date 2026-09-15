/* The generator and the walkthrough must offer the same applications, and one
 * tick must mean the same packages on both sides.
 *
 * They did not. The generator offered 34 and the walkthrough 13, four of which
 * the generator did not have at all, so the two routes this project advertises
 * as "the same install by a different road" produced genuinely different
 * machines from what a reader would call the same answers.
 *
 * Worse than the count: the two sides disagreed about what a tick *meant*. The
 * walkthrough passed the option id straight through as a package name, which
 * worked only because its thirteen ids happened to also be package names. The
 * generator kept its own id-to-packages map. Ticking `bluetooth` on one side
 * was `bluez bluez-utils`; on the other it would have been `pacman -S
 * bluetooth`, which is not a package.
 *
 * Both now read the catalogue in os-install.js. This gate is what stops either
 * one growing its own list again — and it checks the meaning, not just the
 * membership, because two lists can match perfectly while the packages behind
 * them do not.
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

const CAT = w.APPS || [];
ok(CAT.length > 20,
   `the catalogue holds ${CAT.length} applications, too few to be the real list`);

const catIds = CAT.map(a => a.id);
ok(new Set(catIds).size === catIds.length,
   'the catalogue lists the same application id twice, so one entry is unreachable');

/* ── 1. Every entry is complete ───────────────────────────────────────────
   A half-filled row is a checkbox that installs nothing, which is the defect
   this whole table exists to prevent. */
for (const a of CAT) {
    ok(typeof a.label === 'string' && a.label.length > 0, `${a.id} has no label`);
    ok(Array.isArray(a.pkgs) && a.pkgs.length > 0,
       `${a.id} names no packages, so ticking it would install nothing`);
    ok(typeof a.cat === 'string' && a.cat.length > 0, `${a.id} is in no category`);
    ok((a.desc || a.blurb || '').length > 2,
       `${a.id} has nothing said about it, so the reader chooses it blind`);
}

/* ── 2. The walkthrough offers exactly the catalogue ──────────────────────── */
const appsStep = STEPS.find(s => s.id === 'apps');
ok(!!appsStep, 'the walkthrough has no `apps` question');
const wlIds = (appsStep?.options || []).map(o => o.value);
const missingFromWl = catIds.filter(id => !wlIds.includes(id));
const extraInWl = wlIds.filter(id => !catIds.includes(id));
ok(missingFromWl.length === 0,
   `the walkthrough does not offer ${missingFromWl.join(', ')}, which the catalogue has`);
ok(extraInWl.length === 0,
   `the walkthrough offers ${extraInWl.join(', ')}, which is in no catalogue entry, so ` +
   `the emitter has no packages for it`);

/* ── 3. The generator offers exactly the catalogue, plus the security tools ──
   The security suite shares the post_apps input name in the generator's markup
   but is a separate question in the walkthrough, so it is excluded by name
   rather than by a rule that would also excuse a genuine omission. */
const genIds = [...read('index.html')
    .matchAll(/name="post_apps"\s+value="([^"]+)"/g)].map(m => m[1]);
ok(genIds.length > 20,
   `only ${genIds.length} post_apps inputs found in index.html; the match is wrong`);

const toolsStep = STEPS.find(s => s.id === 'security_tools');
const toolIds = (toolsStep?.options || []).map(o => o.value);
ok(toolIds.length > 0, 'the walkthrough has no security_tools question to compare against');

const missingFromGen = catIds.filter(id => !genIds.includes(id));
ok(missingFromGen.length === 0,
   `the generator does not offer ${missingFromGen.join(', ')}, which the catalogue has`);

/* The all-in-one binary is a packaging choice rather than an application or a
   tool: the same daemons, delivered as one signed file instead of five. The
   generator has always carried it as a post_apps checkbox. The walkthrough now
   asks it as its own question, and this is where the two are tied together —
   the exemption is only valid while that question exists and is emitted. */
const SUITE_ID = 'unix-security-suite';
const packagingStep = STEPS.find(s => s.id === 'security_tools_packaging');
ok(!!packagingStep,
   `the generator offers '${SUITE_ID}' and the walkthrough has no question about it, so ` +
   `one route can choose the all-in-one binary and the other cannot`);
ok((packagingStep?.options || []).some(o => o.value === 'suite'),
   'the packaging question does not offer the all-in-one binary as an answer');
ok(/security_tools_packaging/.test(read('manual-guide.js')),
   'the walkthrough asks how to package the security tools and its emitter never reads the ' +
   'answer, so the question changes nothing');

const genExtra = genIds.filter(id => !catIds.includes(id));
const unexplained = genExtra.filter(id => !toolIds.includes(id) && id !== SUITE_ID);
ok(unexplained.length === 0,
   `the generator offers ${unexplained.join(', ')}, which is neither in the catalogue nor ` +
   `a security tool — so ticking it emits nothing and says nothing`);

/* ── 4. One tick means the same packages on both sides ────────────────────
   The check that matters. Two lists can agree perfectly while the packages
   behind them do not, which is exactly how these two drifted. */
ok(/window\.APPS|appPkgs|appById/.test(read('script.js')),
   'the generator does not read the catalogue, so it is keeping its own packages again');
ok(/appPkgs|appAurIds/.test(read('manual-guide.js')),
   'the walkthrough emitter does not read the catalogue, so it is treating option ids as ' +
   'package names again — which is only ever right by accident');

globalThis.window = w;
for (const a of CAT) {
    const viaCatalogue = w.appPkgs([a.id]);
    ok(viaCatalogue.length === a.pkgs.length,
       `appPkgs('${a.id}') returned ${viaCatalogue.length} packages, the entry lists ${a.pkgs.length}`);
    /* An id that is not a package name must not be able to reach a command as
       though it were. `bluetooth`, `obs` and `libreoffice` are the three that
       would have. */
    if (!a.pkgs.includes(a.id)) {
        ok(!viaCatalogue.includes(a.id),
           `'${a.id}' is an option id and not a package, yet it reached the package list`);
    }
}

/* ── 5. AUR-only applications are marked, and only on a system that has one ── */
const aurIds = CAT.filter(a => a.aur).map(a => a.id);
ok(aurIds.length > 0, 'no application is marked as AUR-only, which cannot be right for Arch');
for (const id of aurIds) {
    const label = (appsStep?.options || []).find(o => o.value === id)?.label || '';
    ok(/AUR/.test(label),
       `'${id}' comes from the AUR and the walkthrough does not say so in its label, so the ` +
       `reader cannot tell which choices carry a build script a stranger wrote`);
}

if (failures.length) {
    console.error(`app-parity: ${failures.length} of ${checks} checks failed\n`);
    failures.forEach(f => console.error('  FAIL  ' + f));
    process.exit(1);
}
console.log(`app-parity: ${checks} checks, ${CAT.length} applications offered identically ` +
            `by both front ends (${aurIds.length} from the AUR), 0 failed`);
