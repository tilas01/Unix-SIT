/* The generator must never refuse to generate over a question it has withdrawn.
 *
 * Choosing "All of them" for the wallpapers answers both the count and the
 * dark/light split, so validateConfigurations() greys both out. They stay on
 * screen, and the "No Selection Provided" option injected into every select at
 * load leaves them holding an empty value — so the required-field sweep, which
 * tested visibility alone, counted two options as still needing one. Generation
 * was refused, two dropdowns were outlined in red, and the walk-to-next control
 * marched the reader to controls that cannot be opened. There was no way out of
 * it from the page.
 *
 * Nothing caught it because nothing could. jsdom performs no layout, so
 * `offsetParent` is null for every element in it, the required-field filter
 * selects nothing, and the whole validation path is inert under every existing
 * gate — including the one that drives this same form. A shim answering
 * offsetParent from the computed display of each ancestor is what makes the
 * path executable here at all. It is an approximation of layout, and it is
 * enough, because the rule being tested is about state rather than about pixels.
 *
 * The invariant, stated once: a control the reader cannot act on cannot be
 * required. Asserted directly, so a future lock that disables a control without
 * giving it a value is caught here rather than by a reader.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { serve, loadPage } from './serve.mjs';

const WEB = process.argv[2] || '../website';

let checks = 0;
const failures = [];
const ok = (cond, label) => { checks++; if (!cond) failures.push(label); };

/* offsetParent, answered from the computed display of the element and its
   ancestors — which is what the site's own visibility test is reaching for. */
function installLayoutShims(window) {
    const doc = window.document;
    Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() {
            if (!doc.contains(this)) return null;
            for (let el = this; el && el.nodeType === 1; el = el.parentElement) {
                if (el === doc.body) break;
                if (el.hidden) return null;
                let display = el.style && el.style.display;
                if (!display) {
                    try { display = window.getComputedStyle(el).display; }
                    catch (_) { display = ''; }
                }
                if (display === 'none') return null;
            }
            return doc.body;
        }
    });
    // Layout-dependent, and the generator calls it the moment output is ready.
    window.Element.prototype.scrollIntoView = function () {};
}

/** Fill the form the way a reader working down it would, skipping `leave`. */
function fillForm(window, leave) {
    const doc = window.document;
    const skip = new Set(leave);
    for (const sel of doc.querySelectorAll('#install-form select')) {
        if (sel.offsetParent === null || skip.has(sel.id) || sel.disabled) continue;
        if (sel.value) continue;
        const opt = Array.from(sel.options).find(o => o.value && !o.disabled);
        if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new window.Event('change', { bubbles: true }));
        }
    }
    const disk = doc.getElementById('target-disk');
    if (disk) disk.value = '/dev/sda';
}

/** Choose a value and let the cross-field checks run. */
function choose(window, id, value) {
    const el = window.document.getElementById(id);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
    return el.value === value;
}

const server = await serve(WEB);

/* Each case leaves exactly the sub-questions a reader would leave: the ones the
   form itself greys out in response to the choice above them. */
const CASES = [
    {
        name: 'wallpapers: all of them',
        set: [['desktop', 'gnome'], ['wallpapers', 'all']],
        leave: ['wallpaper_count', 'wallpaper_split'],
        expect: /fetch_wallpapers dark 135/
    },
    {
        name: 'wallpapers: none',
        set: [['desktop', 'gnome'], ['wallpapers', 'none']],
        leave: ['wallpaper_count', 'wallpaper_split'],
        expect: null
    },
    {
        name: 'wallpapers: dark only, no split to make',
        set: [['desktop', 'gnome'], ['wallpapers', 'dark'], ['wallpaper_count', '50']],
        leave: ['wallpaper_split'],
        expect: /fetch_wallpapers dark 50/
    },
    {
        name: 'wallpapers: a mix, split answered',
        set: [['desktop', 'gnome'], ['wallpapers', 'mixed'],
              ['wallpaper_count', '100'], ['wallpaper_split', '75']],
        leave: [],
        expect: /fetch_wallpapers dark 75/
    },
    {
        /* Dusky pins the display server by disabling it. It sets a value first,
           so this passes today. It is here because it is the same shape, and a
           lock that forgets the value is the next instance of this bug. */
        name: 'Dusky, whose locks disable what they pin',
        set: [['desktop', 'dusky']],
        leave: ['display_server', 'wallpaper_count', 'wallpaper_split'],
        expect: null
    },
    {
        /* The reported failure, reproduced exactly rather than approximately.

           On the real page both of these read empty at load, because two
           DOMContentLoaded handlers inject the "No Selection Provided" option
           and the second one claims the selection unconditionally, discarding
           the defaults the markup declares. jsdom does not reach that state:
           the injected option is disabled, and jsdom's select-reset skips
           disabled options where Chromium honours an explicit `selected`, so
           the markup default survives here and does not survive in a browser.

           Measured in Chromium against this page, not assumed. Establishing the
           state directly is what makes this case test the rule instead of
           testing which engine is running it. */
        name: 'all of them, with the empty values a browser actually produces',
        set: [['desktop', 'gnome'], ['wallpapers', 'all']],
        leave: ['wallpaper_count', 'wallpaper_split'],
        emptyAfter: ['wallpaper_count', 'wallpaper_split'],
        expect: /fetch_wallpapers dark 135/
    }
];

for (const c of CASES) {
    const { window } = await loadPage(JSDOM, VirtualConsole, server.origin, 'index.html', { wait: 400 });
    for (let i = 0; i < 100 && typeof window.generateOutput !== 'function'; i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    if (typeof window.generateOutput !== 'function') {
        ok(false, `${c.name}: the generator's scripts never finished running`);
        window.close();
        continue;
    }
    installLayoutShims(window);

    const doc = window.document;
    ok(Array.from(doc.querySelectorAll('#install-form select')).some(s => s.offsetParent !== null),
       `${c.name}: the layout shim reported every control hidden, so nothing was tested`);

    for (const [id, value] of c.set) {
        ok(choose(window, id, value), `${c.name}: could not choose ${id} = ${value}`);
    }
    fillForm(window, c.leave);
    // Re-apply: filling the rest of the form re-runs the cross-field checks.
    for (const [id, value] of c.set) choose(window, id, value);

    for (const id of c.emptyAfter || []) {
        const el = doc.getElementById(id);
        el.value = '';
        ok(el.disabled,
           `${c.name}: ${id} is not disabled, so this case is no longer the one it means to test`);
    }

    let threw = '';
    try { window.generateOutput(false); }
    catch (e) { threw = String((e && e.message) || e); }
    ok(!threw, `${c.name}: generateOutput threw — ${threw}`);

    const box = doc.getElementById('generate-error-box');
    const blocked = box && box.style.display === 'block';
    const reason = blocked ? ((doc.getElementById('error-list') || {}).textContent || '') : '';
    ok(!blocked, `${c.name}: generation was refused — ${reason.replace(/\s+/g, ' ').trim()}`);

    /* The invariant. Whatever put a control out of reach, it cannot then be
       demanded: the reader has no way to satisfy it. */
    const unreachable = Array.from(doc.querySelectorAll('#install-form .field-invalid'))
        .filter(el => el.disabled)
        .map(el => el.id || el.tagName);
    ok(unreachable.length === 0,
       `${c.name}: ${unreachable.join(', ')} was demanded while disabled — the reader ` +
       `cannot supply a value, so the form is a dead end`);

    /* All three staged outputs. The wallpaper fetch belongs to the post-install
       run, so reading only the install script would report a working answer as
       a missing one. These are the keys the Live Editor reads, which is what a
       reader actually carries away. */
    const sh = window.sessionStorage.getItem('live_sh') || '';
    const out = [window.sessionStorage.getItem('live_md') || '', sh,
                 window.sessionStorage.getItem('live_post_sh') || ''].join('\n');
    ok(sh.length > 200, `${c.name}: no script was produced`);
    if (c.expect) {
        ok(c.expect.test(out),
           `${c.name}: the answer did not reach the output (expected ${c.expect})`);
    }
    window.close();
}

/* ── The smart analysis must have somewhere to appear ──────────────────────
 *
 * validateConfigurations() has written its findings to `#global-warnings` on
 * every change since it was written, and that element was not in the markup -
 * so no reader has ever seen one. No encryption, Nvidia under a libre policy,
 * dwm on Wayland, two applications doing the same job: all of it computed
 * correctly and posted to nothing.
 *
 * Driven rather than grepped, because the element existing is not the point;
 * the text arriving in it is. A container that is present and never written to
 * is the same defect with better markup.
 */
{
    const { window } = await loadPage(JSDOM, VirtualConsole, server.origin, 'index.html', { wait: 400 });
    for (let i = 0; i < 100 && typeof window.generateOutput !== 'function'; i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    installLayoutShims(window);
    const doc = window.document;

    const box = doc.getElementById('global-warnings');
    ok(!!box,
       'index.html has no #global-warnings, so every smart-analysis finding is written ' +
       'to nothing and no reader ever sees one');

    if (box) {
        /* Two applications that do the same job is the cheapest condition to
           trigger and needs no other answers, so this tests the plumbing
           rather than a particular rule. */
        for (const v of ['pfetch', 'fastfetch']) {
            const el = doc.querySelector(`input[name="post_apps"][value="${v}"]`);
            if (el) { el.checked = true; }
        }
        window.validateConfigurations();
        await new Promise(r => setTimeout(r, 100));

        ok((window.smartAnalysisWarnings || []).length > 0,
           'ticking two system information tools produced no smart-analysis finding');
        ok(box.style.display === 'block',
           'the smart analysis found something and left its container hidden');
        ok(/pfetch/.test(box.textContent) && /fastfetch/.test(box.textContent),
           'the smart-analysis container does not name the two applications it is warning ' +
           `about - it holds: ${JSON.stringify((box.textContent || '').slice(0, 80))}`);
    }
    window.close();
}

await server.close();

if (failures.length) {
    console.error(`generator-validation: ${failures.length} of ${checks} checks failed\n`);
    failures.forEach(f => console.error('  FAIL  ' + f));
    process.exit(1);
}
console.log(`generator-validation: ${checks} checks passed across ${CASES.length} configurations`);
