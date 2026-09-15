
// ─── Modal Configuration State ───
let currentConfigAppId = null;
let currentConfigSaved = false;

// Override close modal button to act as Discard
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-modal-btn');
    const saveBtn = document.getElementById('save-modal-btn');
    const modal = document.getElementById('app-config-modal');
    
    if (closeBtn) {
        // Remove old listeners by cloning
        const newCloseBtn = closeBtn.cloneNode(true);
        newCloseBtn.innerHTML = '❌ Discard';
        newCloseBtn.style.fontSize = '0.9rem';
        newCloseBtn.style.padding = '0.4rem 0.8rem';
        newCloseBtn.style.background = 'var(--bg-lighter)';
        newCloseBtn.style.border = '1px solid var(--accent-red)';
        newCloseBtn.style.color = 'var(--accent-red)';
        newCloseBtn.style.borderRadius = '6px';
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        newCloseBtn.addEventListener('click', () => {
            currentConfigSaved = false;
            closeAppConfigModal();
        });
    }
    
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        newSaveBtn.innerHTML = '✅ Save Configuration';
        newSaveBtn.style.background = 'var(--accent-green)';
        newSaveBtn.style.color = 'var(--bg-darker)';
        newSaveBtn.style.fontWeight = 'bold';
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        
        newSaveBtn.addEventListener('click', () => {
            currentConfigSaved = true;
            // The existing saveAppConfig logic will be called, but we also need to close it
            saveAppConfig(); 
            closeAppConfigModal();
        });
    }
});

// Update the closeAppConfigModal function
window.closeAppConfigModal = function() {
    const modal = document.getElementById('app-config-modal');
    if (modal) modal.style.display = 'none';
    
    // If not saved, uncheck the app!
    if (!currentConfigSaved && currentConfigAppId) {
        const cb = document.querySelector(`input[value="${currentConfigAppId}"]`);
        if (cb && cb.checked) {
            cb.checked = false;
            // Mark as unconfigured
            cb.setAttribute('data-configured', 'false');
            alert(`Configuration for ${currentConfigAppId} discarded. App disabled.`);
        }
    } else if (currentConfigSaved && currentConfigAppId) {
        const cb = document.querySelector(`input[value="${currentConfigAppId}"]`);
        if (cb) cb.setAttribute('data-configured', 'true');
    }
    
    currentConfigAppId = null;
};


// ─── Live Editor hand-off ───────────────────────────────────────────────────
// live.html reads exactly these three keys on load. Previously the generator
// wrote 'live_md'/'live_sh'/'live_post_sh' while live.html read
// 'generated_script'/'generated_markdown', so the standalone editor never found
// anything -- which is why both of its Load buttons appeared to do nothing.
// One writer, one set of key names.
const LIVE_KEYS = { md: 'live_md', sh: 'live_sh', post: 'live_post_sh' };

// The generator emits one script with a boundary marker; the UI shows the two
// halves separately. Single source of truth for that split.
const POST_INSTALL_BOUNDARY = '### POST-INSTALL BOUNDARY ###';

function splitInstallScript(shContent) {
    const sh = shContent || '';
    if (!sh.includes(POST_INSTALL_BOUNDARY)) return { mainSh: sh, postSh: '' };
    const parts = sh.split(POST_INSTALL_BOUNDARY);
    return { mainSh: parts[0].trim(), postSh: parts.slice(1).join(POST_INSTALL_BOUNDARY).trim() };
}
window.splitInstallScript = splitInstallScript;

function stageForLiveEditor(mdContent, shContent, postContent) {
    try {
        sessionStorage.setItem(LIVE_KEYS.md, mdContent || '');
        sessionStorage.setItem(LIVE_KEYS.sh, shContent || '');
        sessionStorage.setItem(LIVE_KEYS.post, postContent || '');
    } catch (e) { /* storage full or blocked; editor will just open empty */ }
}
window.stageForLiveEditor = stageForLiveEditor;

// ─── Shared config envelope ─────────────────────────────────────────────────
// The *nix Install Walkthrough and this generator are separate implementations, but
// they read and write the SAME JSON envelope, so a config saved from one loads
// in the other. The envelope wraps whatever answers/form values the producing
// tool uses under `answers`; each importer applies the keys it recognises and
// ignores the rest, which is what lets two different option sets share a format.
const CONFIG_SCHEMA = 'unix-sit/config';
/* The identifier the project used before it was renamed to Unix-SIT.
   Configurations are files people keep, and every one handed out by the site so
   far carries this. Reading it costs one comparison; refusing it would turn a
   rename into a day somebody's saved install stopped loading, with nothing on
   screen to explain why. Written only in the new spelling. */
const CONFIG_SCHEMA_LEGACY = 'unix-guides-dynamic/config';
const CONFIG_GENERATOR = 'Unix-SIT';
const CONFIG_GENERATOR_LEGACY = 'unix-guides-dynamic';
const CONFIG_VERSION = 2;

/** Whether an envelope is one of ours, under either name. */
function isKnownConfigEnvelope(data) {
    if (!data || typeof data !== 'object') return false;
    return data.schema === CONFIG_SCHEMA || data.schema === CONFIG_SCHEMA_LEGACY ||
           data.generator === CONFIG_GENERATOR || data.generator === CONFIG_GENERATOR_LEGACY;
}
window.isKnownConfigEnvelope = isKnownConfigEnvelope;

function wrapConfig(answers, source) {
    return {
        schema: CONFIG_SCHEMA,
        version: CONFIG_VERSION,
        source: source || 'dynamic-generator',
        created: new Date().toISOString(),
        answers: answers || {}
    };
}
window.wrapConfig = wrapConfig;

// Accept the envelope, a bare answers object (legacy .sc/.json), or the
// walkthrough's file — always return the flat answers object, never null.
function unwrapConfig(parsed) {
    if (!parsed || typeof parsed !== 'object') return {};
    let answers = (parsed.answers && typeof parsed.answers === 'object')
        ? parsed.answers
        : parsed; // legacy bare object

    // A config exported from the *nix Install Walkthrough is flat and keyed by
    // question id, not by form control. Translate it so importing one here
    // actually configures the form instead of quietly doing nothing.
    if (window.ConfigTranslate && !window.ConfigTranslate.isGeneratorShape(answers)) {
        const t = window.ConfigTranslate.translateEnvelope(
            { answers: answers }, 'dynamic-generator');
        if (t.translated) {
            if (t.unmapped.length) {
                console.info('[config] imported from the walkthrough; no equivalent here for:',
                             t.unmapped.join(', '));
            }
            return t.answers;
        }
    }
    return answers;
}
window.unwrapConfig = unwrapConfig;

function configJSONString(answers, source) {
    return JSON.stringify(wrapConfig(answers, source), null, 2);
}
window.configJSONString = configJSONString;

// Called from generate button — adds "Open in Live Editor" button to output
window.injectLiveEditorLink = function() {
    let outputSection = document.getElementById('output-section');
    if (!outputSection) return;
    // Remove old link if exists
    let old = document.getElementById('live-editor-link-btn');
    if (old) old.remove();

    let btn = document.createElement('a');
    btn.id = 'live-editor-link-btn';
    btn.href = 'live.html';
    btn.textContent = '📝 Open in Full Live Editor';
    btn.style.cssText = 'display:inline-block; margin-top:1rem; background:var(--accent-cyan); color:var(--bg-darker); padding:0.6rem 1.2rem; border-radius:8px; font-weight:bold; text-decoration:none; font-size:0.9rem; transition:filter 0.2s;';
    btn.onmouseenter = () => btn.style.filter = 'brightness(1.1)';
    btn.onmouseleave = () => btn.style.filter = '';
    outputSection.insertAdjacentElement('afterbegin', btn);
};


// NOTE: the group select-all helpers live near the bottom of this file
// (enableAllTilas / enableAllOtherSec). Earlier duplicates of them used to sit
// here and, because `window.x = ...` runs after function hoisting, they
// silently overwrote the working versions with ones that queried grid IDs
// (#my-tools-grid, #other-security-grid) that do not exist in the markup —
// which is why both "Enable All" buttons did nothing.

// =============================================
// *nix Install Guides - Main Script
// Arch Rusty Security Suite by tilas01
// =============================================

// ---- Form Initialization & "No Selection" Injection ----
document.addEventListener('DOMContentLoaded', () => {

    // Ensure 'No Selection Provided' text is greyed out
    document.querySelectorAll('.generator-form select').forEach(sel => {
        if (sel.value === "") sel.style.color = "var(--fg-dim, #7f88ad)";
        
        // Trigger immediately on interaction to prevent iOS WebKit ghosting
        const removePlaceholder = function() {
            this.style.color = ""; // Restore normal color
            // Remove the empty option permanently once clicked
            if (this.options[0] && this.options[0].value === "") {
                this.options[0].remove();
            }
            // Remove red border and warning if they exist
            this.style.border = "";
            const warningSpan = this.parentElement.querySelector('.req-warning');
            if (warningSpan) warningSpan.remove();
        };
        sel.addEventListener('mousedown', removePlaceholder);
        sel.addEventListener('touchstart', removePlaceholder, { passive: true });
        sel.addEventListener('change', removePlaceholder);
    });

    // Guarantee every select has a placeholder, but never duplicate one the
    // markup already provides, and never clobber a real default selection.
    document.querySelectorAll('select').forEach(select => {
        if (select.querySelector('option[value=""]')) return;

        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.disabled = true;
        defaultOption.hidden = true;
        defaultOption.textContent = "No Selection Provided";
        // Only claim the selection when the markup didn't declare a default.
        defaultOption.selected = !select.querySelector('option[selected]');
        select.insertBefore(defaultOption, select.firstChild);
    });
});

// ---- Generation History ----------------------------------------------------
// Session-scoped only: sessionStorage, so it clears when the tab closes and no
// cookies are involved (the site is static on GitHub Pages). One implementation
// only -- there used to be two, and the second one shadowed the stored history
// with the browser's own `window.history` object, so `history.map` threw and
// the History button silently did nothing.
const HISTORY_KEY = 'arch_gen_history';
const HISTORY_LIMIT = 10;

function readHistory() {
    try {
        const raw = JSON.parse(sessionStorage.getItem(HISTORY_KEY));
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

function writeHistory(entries) {
    try {
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    } catch (e) {
        // Quota exceeded: drop the oldest half and try once more.
        try {
            sessionStorage.setItem(HISTORY_KEY,
                JSON.stringify(entries.slice(0, Math.ceil(entries.length / 2))));
        } catch (e2) { /* give up silently; history is a convenience */ }
    }
}

function timestampNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function saveToHistory(mdContent, shContent, format, postContent, scContent) {
    const entries = readHistory();
    entries.unshift({
        timestamp: timestampNow(),
        // Which front end produced this, so the live editor and history can
        // label entries. The walkthrough writes 'manual-walkthrough'.
        source: 'dynamic-generator',
        /* Which system it was generated for. Without this, two entries made
           minutes apart for different systems are indistinguishable in the
           list, and the one you restore decides which commands you run. */
        os: (typeof window.targetOS === 'function' ? window.targetOS() : 'arch'),
        format,
        md: mdContent || '',
        sh: shContent || '',
        post: postContent || '',
        sc: scContent || ''
    });
    writeHistory(entries.slice(0, HISTORY_LIMIT));
    updateHistoryTooltip();
}

// Renders into whichever history container the page provides.
function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    const entries = readHistory();

    if (entries.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--fg-color); opacity:0.7;">' +
            'No generations yet this session.</p>';
        return;
    }

    list.innerHTML = entries.map((h, i) => `
        <div style="background:var(--bg-color); border:1px solid var(--border-color); padding:1rem; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem; gap:0.5rem; flex-wrap:wrap;">
                <strong style="color:var(--accent-blue);">${escapeHTML(h.timestamp)}</strong>
                <span style="font-size:0.78rem; color:var(--accent-cyan);">${escapeHTML(h.format || 'both')}</span>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button type="button" class="btn" style="padding:0.3rem 0.8rem; font-size:0.8rem; background:var(--accent-cyan); color:var(--bg-darker);" onclick="loadHistoryIntoEditor(${i})">📝 Open in Live Editor</button>
                <button type="button" class="btn" style="padding:0.3rem 0.8rem; font-size:0.8rem;" onclick="downloadHistoryItem(${i}, 'md')">📄 Guide</button>
                <button type="button" class="btn" style="padding:0.3rem 0.8rem; font-size:0.8rem;" onclick="downloadHistoryItem(${i}, 'sh')">⚙️ Install</button>
                ${h.post ? `<button type="button" class="btn" style="padding:0.3rem 0.8rem; font-size:0.8rem;" onclick="downloadHistoryItem(${i}, 'post')">🚀 Post</button>` : ''}
                ${h.sc ? `<button type="button" class="btn" style="padding:0.3rem 0.8rem; font-size:0.8rem; background:var(--bg-lighter);" onclick="downloadHistoryItem(${i}, 'sc')">📦 .json</button>` : ''}
            </div>
        </div>
    `).join('');
}

// Downloads straight from the stored entry. The previous version base64-encoded
// every entry into the markup on render, which broke on non-Latin-1 content and
// bloated the DOM; reading the entry on click avoids both problems.
window.downloadHistoryItem = function(idx, which) {
    const entry = readHistory()[idx];
    if (!entry) return;
    const files = {
        md:   ['arch_guide.md',     entry.md],
        sh:   ['install.sh',        entry.sh],
        post: ['post_install.sh',   entry.post],
        sc:   ['arch-config.json',  entry.sc]
    };
    const [name, content] = files[which] || [];
    if (name && content) window.downloadFile(content, name);
};

// Hands a past generation to the standalone Live Editor page, which auto-loads
// whatever is in sessionStorage when it opens.
window.loadHistoryIntoEditor = function(idx) {
    const entry = readHistory()[idx];
    if (!entry) return;
    stageForLiveEditor(entry.md, entry.sh, entry.post);
    window.open('live.html', '_blank');
};

window.openHistoryModal = function() {
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    renderHistory();
    modal.style.display = 'flex';
};

window.closeHistoryModal = function() {
    const modal = document.getElementById('history-modal');
    if (modal) modal.style.display = 'none';
};

window.toggleHistoryModal = function() {
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    const visible = modal.style.display === 'flex';
    if (visible) window.closeHistoryModal();
    else window.openHistoryModal();
};

window.clearHistory = function() {
    // shared-ui.js owns this: it lists what is about to be lost and offers to
    // download it first. A bare confirm() is answered yes by reflex, and this
    // history exists in one tab and nowhere else.
    if (typeof window.clearHistoryWithWarning === 'function') {
        window.clearHistoryWithWarning(function () {
            renderHistory();
            updateHistoryTooltip();
        });
        return;
    }
    // shared-ui.js absent: still ask, still clear, rather than doing nothing.
    if (!confirm("Clear every generated guide in this session? They exist only in this tab.")) return;
    sessionStorage.removeItem(HISTORY_KEY);
    renderHistory();
    updateHistoryTooltip();
};


// ─── Page switching: Generator ↔ Output ──────────────────────────────────────
function showOutputPage(mdContent, shContent, format, scContent) {
    // Split install vs post-install on the boundary marker the generator emits.
    const { mainSh, postSh } = splitInstallScript(shContent);
    stageForLiveEditor(mdContent, mainSh, postSh);

    // Check if Live Generation Toggle is checked
    const liveToggle = document.getElementById('live_generation_toggle');
    if (liveToggle && liveToggle.checked) {
        window.location.href = "live.html";
        return;
    }

    // Scroll to Live Editor instead of hiding form
    const liveEditor = document.getElementById('live-editor');
    if (liveEditor) {
        liveEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Build dynamic download buttons
    const dlContainer = document.getElementById('download-btns');
    if (dlContainer) {
        dlContainer.innerHTML = '';
        if (mdContent && format !== 'script') {
            const b = document.createElement('button');
            b.className = 'btn btn-tooltip';
            b.setAttribute('data-title', 'Download Markdown Guide');
            b.setAttribute('data-desc', 'Download the generated installation guide as a .md file.');
            b.style.cssText = 'width:auto;padding:0.5rem 1.2rem;background:var(--accent-cyan);color:var(--bg-color);font-size:0.88rem;';
            b.textContent = '⬇ Download .md';
            b.onclick = () => downloadFile(mdContent, 'arch-install-guide.md');
            dlContainer.appendChild(b);
        }
        if (shContent && format !== 'markdown') {
            const b = document.createElement('button');
            b.className = 'btn btn-tooltip';
            b.setAttribute('data-title', 'Download Shell Script');
            b.setAttribute('data-desc', 'Download the generated Bash install script as a .sh file. REVIEW before executing!');
            b.style.cssText = 'width:auto;padding:0.5rem 1.2rem;background:var(--accent-blue);color:var(--bg-color);font-size:0.88rem;';
            b.textContent = '⬇ Download .sh';
            b.onclick = () => downloadFile(shContent, 'arch-install.sh');
            dlContainer.appendChild(b);
        }
        if (scContent) {
            const b = document.createElement('button');
            b.className = 'btn btn-tooltip';
            b.setAttribute('data-title', 'Download your selections as JSON');
            b.setAttribute('data-desc', 'Saves every choice you have made as a .json file. Load it back here, or in the manual walkthrough, to pick up where you left off. Plain JSON, so you can read and edit it in any editor.');
            b.style.cssText = 'width:auto;padding:0.5rem 1.2rem;background:var(--accent-purple);color:var(--bg-color);font-size:0.88rem;';
            b.textContent = '⬇ Download .json';
            b.onclick = () => downloadFile(scContent, 'arch-config.json');
            dlContainer.appendChild(b);
        }
        if (window.refreshTooltips) window.refreshTooltips();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.returnToGenerator = function() {
    const genArea   = document.querySelector('.layout-container');
    const outputSec = document.getElementById('output-section');
    if (genArea)   genArea.style.display = '';
    if (outputSec) outputSec.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.clearGeneratedOutput = function() {
    const guide     = document.getElementById('generated-guide');
    const dlBtns    = document.getElementById('download-btns');
    if (guide)  guide.innerHTML = '';
    if (dlBtns) dlBtns.innerHTML = '';
    window.returnToGenerator();
};



// ---- Update History Button Tooltip Count ----
function updateHistoryTooltip() {
    const btn = document.getElementById('history-btn');
    if (!btn) return;
    let count = 0;
    try { count = (JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || []).length; } catch(e) {}
    btn.setAttribute('data-desc', count > 0
        ? `View and restore previous generation configs. ${count} previous generation${count !== 1 ? 's' : ''} saved this session.`
        : 'No previous generations this session. Generate a guide to start saving history.'
    );
}

// ---- Proprietary / non-libre software register ----
// Shared between the generator (which writes warnings into the output) and the
// form UI (which flags the checkboxes), so the two can never disagree.
const PROPRIETARY_APPS = {
    'firefox':  'Firefox ships proprietary firmware blobs and closed-source telemetry components. LibreWolf is the libre-hardened fork.',
    'chromium': 'Chromium bundles proprietary codecs and Google service integrations.',
    'chrome':   'Google Chrome is fully proprietary and telemetry-heavy. Chromium or LibreWolf is libre.',
    'signal':   'The Signal desktop client is an Electron build distributing pre-compiled proprietary binaries.',
    'flatpak':  'Flatpak itself is libre, but the default Flathub remote distributes proprietary applications.',
    'discord':  'Discord is closed-source and tracks user activity. Use WebCord or a Matrix bridge for a libre alternative.',
    'steam':    'Steam is a proprietary storefront and DRM client by Valve.',
    'spotify':  'Spotify is a closed-source streaming client with proprietary DRM.',
    'vmware':   'VMware Tools (open-vm-tools is libre, but the VMware hypervisor is proprietary).',
    'vbox':     'VirtualBox Extension Pack contains proprietary code (PUEL license).',
    'nvidia':   'NVIDIA drivers contain heavily proprietary closed-source blobs.'
};

// ---- Utility: Escape HTML ----
const escapeHTML = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- Utility: Strip config comment ----
const stripConfig = (s) => s.replace(/<!--[\s\S]*?-->/g, '').trim();

// ---- Download helper ----
window.downloadFile = function(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};


/* Wallpapers from dusklinux/images. The folder counts are real and checked
   against the repository: dark/ 135, light/ 134, so 269 in total at roughly
   65-285 KB each. Capped per folder, because a 50/50 split of "all" cannot draw
   135 light images from a folder that holds 134. */
const WALLPAPER_AVAILABLE = { dark: 135, light: 134 };

function wallpaperCounts(mode, count, split) {
    if (!mode || mode === 'none') return { dark: 0, light: 0, total: 0 };
    const want = count === 'all' ? 269 : parseInt(count || '50', 10);
    const pct = parseInt(split || '75', 10);
    let dark = 0, light = 0;
    if (mode === 'all') {
        // Everything in both folders. No count, no split, no rounding.
        // Kept in step with the same branch in manual-guide.js.
        dark = WALLPAPER_AVAILABLE.dark;
        light = WALLPAPER_AVAILABLE.light;
    }
    else if (mode === 'dark') dark = Math.min(want, WALLPAPER_AVAILABLE.dark);
    else if (mode === 'light') light = Math.min(want, WALLPAPER_AVAILABLE.light);
    else {
        dark = Math.min(Math.round(want * pct / 100), WALLPAPER_AVAILABLE.dark);
        light = Math.min(want - dark, WALLPAPER_AVAILABLE.light);
    }
    return { dark, light, total: dark + light };
}

/* Emits the wallpaper fetch, or '' when none were asked for.

   Lists the folders through the GitHub API and picks at random rather than
   cloning. The collection is ~40 MB and someone who asked for 50 images should
   get 50, not a full clone to prune afterwards. Filenames looked constructible
   (0001.jpg, 0002.jpg …) but the collection is not uniform — dark/0131 is
   .jpeg, and the file counts do not line up with the highest number — so
   building URLs by counting would 404 on real files. Every download failure is
   skipped rather than aborting the run.

   `owner` is the user to chown to, or null when the block runs as that user
   already (the markdown path, which the reader pastes into their own shell). */
function emitWallpapers(dir, owner) {
    const mode = gv('wallpapers', 'none');
    const wp = wallpaperCounts(mode, gv('wallpaper_count', '50'), gv('wallpaper_split', '75'));
    if (wp.total <= 0) return '';

    let o = '';
    o += `# ${wp.total} wallpapers by dusklinux — https://github.com/dusklinux/images\n`;
    o += `# Picked at random, so you get a different set each time.\n`;
    o += `mkdir -p ${dir}\n`;
    o += `fetch_wallpapers() {\n`;
    o += `  local tone="$1" count="$2"\n`;
    o += `  [ "$count" -gt 0 ] || return 0\n`;
    o += `  curl -fsSL "https://api.github.com/repos/dusklinux/images/contents/$tone" \\n`;
    o += `    | grep -o '"download_url": *"[^"]*"' | cut -d'"' -f4 \\n`;
    o += `    | shuf -n "$count" \\n`;
    o += `    | while read -r url; do\n`;
    o += `        curl -fsSL --retry 2 -o "${dir}/\${tone}-\${url##*/}" "$url" || echo "skipped $url" >&2\n`;
    o += `      done\n`;
    o += `}\n`;
    if (wp.dark)  o += `fetch_wallpapers dark ${wp.dark}\n`;
    if (wp.light) o += `fetch_wallpapers light ${wp.light}\n`;
    if (owner) o += `chown -R ${owner}:${owner} ${dir}\n`;
    return o;
}

// ---- Live Preview Updater ----
window.updatePreview = function() {
    const mdEl = document.getElementById('raw-md-code');
    const previewEl = document.getElementById('preview');
    if (!mdEl || !previewEl) return;
    const clean = stripConfig(mdEl.innerText || "");
    // Was `marked` from jsdelivr. Two reasons that had to go: it sent every
    // visitor's IP to a third party on a site whose subject is not leaking to
    // third parties, and it ran unpinned remote script on the page that renders
    // the install script people are told to read before executing. markdown.js
    // ships with the site, so the preview also works offline from a live USB.
    if (typeof window.renderMarkdown === 'function') {
        previewEl.innerHTML = window.renderMarkdown(clean, { headingPrefix: 'gen-' }).html;
        if (window.highlightAll) window.highlightAll(previewEl);
    } else {
        previewEl.textContent = clean;
    }
};

// ─── Per-app configuration defaults ──────────────────────────────────────────
// Every app that exposes a settings dialog has a recommended value for each
// field. If the user never opens the dialog, these are applied and reported
// rather than blocking generation — an unopened dialog means "no opinion", not
// an error. Anything with a security consequence is noted in `why` so the
// summary can explain the choice instead of just asserting it.
const APP_CONFIG_DEFAULTS = {
    'git': {
        label: 'Git',
        fields: {
            modal_git_user:  { value: '',  label: 'user.name',  optional: true },
            modal_git_email: { value: '',  label: 'user.email', optional: true }
        },
        summary: 'left unset — the generated script prompts you on first use',
        why: 'Committing with a wrong identity is harder to undo than setting it later.'
    },
    'snapper': {
        label: 'Snapper',
        fields: {
            modal_snapper_timeline: { value: 'enabled', label: 'timeline snapshots' }
        },
        summary: 'pre/post pacman snapshots plus hourly timeline',
        why: 'Snapshots before every package transaction are what let you roll back a bad update.'
    },
    'timeshift': {
        label: 'Timeshift',
        fields: {
            modal_timeshift_mode:     { value: 'rsync', label: 'backup mode' },
            modal_timeshift_schedule: { value: 'daily', label: 'schedule' }
        },
        summary: 'rsync mode, daily schedule',
        why: 'rsync works on any filesystem; BTRFS mode needs a specific subvolume layout.'
    },
    'unattended-upgrades': {
        label: 'Unattended upgrades',
        fields: {
            modal_upgrade_reboot: { value: 'false', label: 'automatic reboot' }
        },
        summary: 'automatic reboot disabled',
        why: 'An unattended reboot can interrupt work and, with FDE, leaves the machine sitting at a passphrase prompt.'
    },
    'doas': {
        label: 'Doas',
        fields: {
            modal_doas_mode: { value: 'both', label: 'sudo coexistence' }
        },
        summary: 'installed alongside sudo rather than replacing it',
        why: 'Replacing sudo outright can break scripts and AUR helpers that call it by name.'
    },
    'aem': {
        label: 'Anti-Evil Maid',
        fields: {
            modal_aem_decoy_mode:  { value: 'none', label: 'decoy password' },
            modal_aem_duress_mode: { value: 'none', label: 'duress password' },
            // Defaults to off. Suspending the volume that backs / freezes every
            // disk read until the passphrase is typed, so a machine that
            // auto-locks without the owner having chosen it is a machine that
            // looks broken the first time it happens.
            modal_aem_autolock:    { value: 'never', label: 'LUKS auto-lock' },
            // Off by default for the same reason as auto-lock: a machine that
            // freezes its disk the first time the screensaver fires, on an owner
            // who did not choose that, looks broken rather than secure.
            modal_aem_lock_on_screen: { value: 'no', label: 'LUKS suspend on screen lock' }
        },
        summary: 'boot verification only — no decoy or duress password, no auto-lock',
        why: 'The duress option destroys data irreversibly, so it is never enabled without an explicit choice.'
    }
};

// Applies defaults for any checked app whose dialog was never completed.
// Returns [{ app, summary, why }] describing what was decided.
function applyRecommendedAppDefaults() {
    const applied = [];

    document.querySelectorAll('input[name="post_apps"]:checked').forEach(cb => {
        const spec = APP_CONFIG_DEFAULTS[cb.value];
        if (!spec) return;
        if (cb.dataset.requiresConfig !== 'true') return;
        if (cb.dataset.configured === 'true') return;   // user made a choice

        // Fill any field the dialog would have set, without overwriting a value
        // that is already there.
        Object.entries(spec.fields).forEach(([id, field]) => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = field.value;
        });

        cb.dataset.configured = 'true';
        cb.dataset.usedDefaults = 'true';
        applied.push({ app: spec.label, summary: spec.summary, why: spec.why });
    });

    return applied;
}

// Tells the user which defaults were chosen, once, above the output.
function reportAppDefaults(applied) {
    const host = document.getElementById('defaults-notice');
    if (!host) return;

    if (!applied || applied.length === 0) {
        host.style.display = 'none';
        host.innerHTML = '';
        return;
    }

    host.innerHTML =
        `<strong>ℹ️ Recommended settings applied</strong>
         <p style="margin:0.4rem 0;">You did not open the settings for
         ${applied.length === 1 ? 'one app' : `${applied.length} apps`}, so the
         recommended configuration was used. Everything below is already in your
         generated script — adjust the ⚙️ settings and regenerate if you want
         something different.</p>
         <ul style="margin:0.4rem 0 0 1.1rem;">` +
        applied.map(a =>
            `<li><strong>${escapeHTML(a.app)}</strong>: ${escapeHTML(a.summary)}
             <span style="color:var(--fg-dim);">— ${escapeHTML(a.why)}</span></li>`
        ).join('') +
        `</ul>`;
    host.style.display = 'block';
}

// ─── Validation presentation ─────────────────────────────────────────────────
// One red box, offenders outlined in red, and a single control that walks
// through them. The previous version printed one list item per unset dropdown,
// which on a fresh page meant a wall of ~30 identical complaints.

function clearValidationState() {
    document.querySelectorAll('#install-form .field-invalid').forEach(el => {
        el.classList.remove('field-invalid');
    });
    document.querySelectorAll('#install-form .app-card.card-invalid').forEach(el => {
        el.classList.remove('card-invalid');
    });
}

function hideValidationBox() {
    const box = document.getElementById('generate-error-box');
    if (box) box.style.display = 'none';
}

// Remembers where we are in the walk-through, so repeated clicks advance.
let validationCursor = 0;

function showValidationProblems({ missing, conflicts, unconfigured, nothingTouched }) {
    const box = document.getElementById('generate-error-box');
    const body = document.getElementById('error-list');
    const countEl = document.getElementById('error-count');
    if (!box || !body) return;

    // Outline the offenders.
    missing.forEach(sel => sel.classList.add('field-invalid'));
    conflicts.forEach(c => c.el && c.el.classList.add('field-invalid'));
    unconfigured.forEach(u => u.el?.closest('.app-card')?.classList.add('card-invalid'));

    // The ordered list of things to walk through.
    const targets = [
        ...conflicts.map(c => c.el).filter(Boolean),
        ...unconfigured.map(u => u.el).filter(Boolean),
        ...missing
    ];
    validationCursor = 0;

    let html = '';

    if (nothingTouched && conflicts.length === 0 && unconfigured.length === 0) {
        // Nothing filled in: say that once, and don't itemise.
        html = `<p style="margin:0;">Nothing has been selected yet, so there is nothing to generate.
                Work down the form and choose your options — every dropdown has a
                <a href="wiki.html#option-reference" target="_blank" rel="noopener">wiki entry</a>
                explaining it, and you can right-click any of them to jump straight there.</p>`;
        if (countEl) countEl.textContent = '0';
    } else {
        const parts = [];

        // Conflicts are always explained in full.
        conflicts.forEach(c => {
            parts.push(`<li><strong style="color:var(--accent-red);">Conflict:</strong> ${escapeHTML(c.msg)}</li>`);
        });

        // Unconfigured apps name themselves, since the fix is specific.
        unconfigured.forEach(u => {
            parts.push(`<li><strong style="color:var(--accent-orange);">Needs setup:</strong>
                open the ⚙️ gear on <strong>${escapeHTML(u.name)}</strong> and save its configuration.</li>`);
        });

        // Omissions are summarised, not enumerated.
        if (missing.length === 1) {
            const label = fieldLabel(missing[0]);
            parts.push(`<li><strong style="color:var(--accent-red);">Not chosen:</strong> ${escapeHTML(label)}</li>`);
        } else if (missing.length > 1) {
            parts.push(`<li><strong style="color:var(--accent-red);">Not chosen:</strong>
                ${missing.length} options still need a value — they are outlined in red below.</li>`);
        }

        html = `<ul style="margin:0 0 0 1.1rem; padding:0;">${parts.join('')}</ul>`;
        if (countEl) countEl.textContent = String(conflicts.length + unconfigured.length + missing.length);
    }

    // One clear action, rather than making the whole box a mystery click target.
    if (targets.length > 0) {
        html += `<div style="margin-top:0.7rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button type="button" class="btn" style="width:auto; padding:0.35rem 0.9rem; font-size:0.82rem;"
                    onclick="jumpToNextProblem()">↪ Jump to next (${targets.length})</button>
        </div>`;
    }

    body.innerHTML = html;
    window.__validationTargets = targets;
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Human-readable name for a field, preferring the form-step title.
function fieldLabel(el) {
    const step = el.closest('.form-step');
    const title = step?.getAttribute('data-title');
    if (title) return title.replace(/^[^\w]+\s*/, '');   // strip a leading emoji
    const lbl = el.closest('.form-group')?.querySelector('label');
    return (lbl?.textContent || el.id || 'this field').replace(/:\s*$/, '').trim();
}

// Walks through the outstanding problems, one click at a time.
window.jumpToNextProblem = function() {
    const targets = window.__validationTargets || [];
    if (targets.length === 0) return;
    const el = targets[validationCursor % targets.length];
    validationCursor++;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus the control itself where possible so it can be answered immediately.
    if (typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    }
};

// Clear a field's red outline as soon as the user answers it.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#install-form select').forEach(sel => {
        sel.addEventListener('change', () => {
            if (sel.value) sel.classList.remove('field-invalid');
        });
    });

    // Live package search on the free-text package field. Guarded: if
    // pkg-search.js did not load, the field stays a plain text box and the
    // generated script still verifies every name on the machine.
    const pkgField = document.getElementById('extra_packages');
    const pkgMount = document.getElementById('extra-packages-search');
    if (pkgField && pkgMount && window.PkgSearch) {
        try {
            window.PkgSearch.attach(pkgField, { mount: pkgMount });
        } catch (_) { /* the field alone is still usable */ }
    }
});

// ---- Form readers ----
// Module scope on purpose: the validation matrix at the top of generateOutput
// needs these before the per-run config constants are declared. Keeping them
// function-local caused a temporal-dead-zone throw ("Cannot access 'gv' before
// initialization") on every single generation.
const gv = (id, def = '') => { const e = document.getElementById(id); return e ? e.value : def; };
const gi = (id, def = 1) => { const e = document.getElementById(id); return e ? parseInt(e.value) || def : def; };

/* The target system's install model, resolved once per generation.
 *
 * generateOutput() works it out from os-meta.js and os-install.js, and most of
 * the emitting happens inside it where that is a local. But several sections
 * are top-level functions rather than closures — the USB-kill switch, the LUKS
 * duress passphrase — and they emit package and service commands too. Threading
 * the model through their signatures would change five call sites for one fact
 * that is the same for the whole run, so it is set here instead, before any of
 * them is called.
 *
 * Arch is the resting value, so a builder called before a generation (or in a
 * harness that never runs one) emits what it always emitted.
 */
let genOs = { key: 'arch', label: 'Arch Linux', model: null, init: null,
              openrc: false, gentoo: false, mnt: '/mnt' };

/* Package name and service commands for whichever system is selected, usable
   from the top-level builders. Each falls back to Arch's own spelling, which is
   what these were before the table existed. */
const genPkgs = list => (window.osPkgNames ? window.osPkgNames(genOs.key, list) : list);
const genInstall = list => (genOs.model
    ? genOs.model.install(genPkgs(list))
    : 'pacman -S --needed --noconfirm ' + list.join(' '));
const genSvc = unit => (genOs.init ? genOs.init.enable(unit) : 'systemctl enable ' + unit);

// ====================================================================
// MAIN OUTPUT GENERATOR
// ====================================================================
window.generateOutput = function(auto = false) {

    // Validation warnings are only surfaced for a deliberate click on Generate.
    // Auto-regeneration (on form change) stays silent so the user isn't nagged
    // while they are still filling the form in.
    const showWarnings = !auto;

    // --- SMART CONFIGURATION VALIDATION MATRIX ---
    if (showWarnings) {
        let hardErrors = [];
        let smartWarnings = [];
        
        const fsType = gv('filesystem', 'ext4');
        const swapType = gv('swap', 'none');
        const hibernate = gv('hibernation', 'no') === 'yes';
        const firewall = gv('firewall', 'none');
        
        
        // ── Anti-Evil Maid + Unencrypted /boot or /efi Warning ──
        
        // ── Auto Updater Validation ──
        // Read locally: the shared config constants are declared further down.
        if (gv('auto_updates', 'no') === 'systemd' && gv('init_system', 'systemd') !== 'systemd') {
            smartWarnings.push("Systemd Timer for Auto Updates selected, but you are not using Systemd as your Init System. Please choose Pacman Hook or Manual instead.");
        }
const selectedPostApps = Array.from(document.querySelectorAll('input[name="post_apps"]:checked')).map(c => c.value);
        if (selectedPostApps.includes('anti-evil-maid')) {
            const fsType = gv('filesystem', 'ext4');
            const partType = gv('partitioning', 'unencrypted');
            const bootloader = gv('bootloader', 'grub');
            
            // Warn if /boot is unencrypted (non-LUKS setup or using GRUB without full-disk)
            if (partType === 'unencrypted') {
                smartWarnings.push('Anti-Evil Maid is selected but your /boot and /efi partitions are unencrypted. ' +
                    'An attacker with physical access can modify your bootloader, kernel, or initramfs without detection. ' +
                    'Anti-Evil Maid can still monitor these partitions for changes, but LUKS2 full-disk encryption ' +
                    'is strongly recommended for full tamper protection. See Wiki: Boot Integrity.');
            } else if (partType.startsWith('luks') && bootloader === 'grub') {
                // GRUB with LUKS still has an unencrypted /boot
                smartWarnings.push('Anti-Evil Maid: GRUB with LUKS leaves /boot unencrypted on disk. ' +
                    'Consider using a UKI (Unified Kernel Image) bootloader with Secure Boot to eliminate the unencrypted /boot attack surface. ' +
                    'Anti-Evil Maid will hash-monitor the /boot contents, but hardware tampering can precede the check.');
            }
        }

// 1. Hibernation without Swap
        if (hibernate && swapType === 'none') {
            hardErrors.push("Hibernation requires a Swap file or partition. Please enable Swap.");
        }

        /* Two applications that do the same job. Never blocked - it is a
           legitimate thing to want - but said out loud with the actual
           difference, because far more often it is somebody working down a
           list who has not noticed the overlap. The table is in os-install.js
           so this notice, the walkthrough's and the wiki's cannot drift. */
        if (typeof window.appOverlaps === 'function') {
            const chosenApps = Array.from(
                document.querySelectorAll('input[name="post_apps"]:checked')
            ).map(cb => cb.value);
            window.appOverlaps(chosenApps).forEach(o => {
                smartWarnings.push(window.appOverlapText(o).join(' '));
            });
        }
        
        // 2. BTRFS without btrfs-progs (Usually installed by base, but good to check conceptually)
        // 3. Custom Firewall with Endlessh
        // textContent, not innerText: innerText is layout-dependent and absent
        // in non-browser DOMs, and the optional chaining keeps a detached
        // checkbox from throwing and aborting the whole generation.
        const endlesshSelected = Array.from(
            document.querySelectorAll('input[name="post_apps"]')
        ).some(cb => cb.checked &&
            (cb.value === 'endlessh' ||
             (cb.parentElement?.textContent || '').includes('Endlessh')));
        if (endlesshSelected && firewall !== 'none') {
            smartWarnings.push("You selected a Custom Firewall profile AND Endlessh. Ensure your firewall allows port 2222 for your real SSH daemon, as Endlessh binds to 22.");
        }
        
        // Display Hard Errors (Blocks Generation)
        if (hardErrors.length > 0) {
            const errDiv = document.createElement('div');
            errDiv.className = 'alert error';
            errDiv.innerHTML = '<strong>[BLOCKED] Invalid Configuration:</strong><ul>' + hardErrors.map(e => `<li>${e}</li>`).join('') + '</ul>';
            errDiv.style.marginBottom = '1.5rem';
            
            const form = document.querySelector('.generator-form');
            if (form) form.insertBefore(errDiv, form.firstChild);

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Auto remove after 10 seconds
            setTimeout(() => { if(errDiv.parentElement) errDiv.remove(); }, 10000);
            return; // STOP GENERATION
        }
        
        // Display Smart Warnings (Allows Generation, but warns)
        if (smartWarnings.length > 0) {
            const warnDiv = document.createElement('div');
            warnDiv.className = 'alert info';
            warnDiv.style.backgroundColor = 'rgba(122, 162, 247, 0.1)';
            warnDiv.style.borderLeft = '4px solid var(--accent-blue)';
            warnDiv.innerHTML = '<strong style="color:var(--accent-blue);">[INFO] Configuration Notice:</strong><ul>' + smartWarnings.map(w => `<li style="color:var(--fg-color);">${w}</li>`).join('') + '</ul>';
            warnDiv.style.marginBottom = '1.5rem';
            
            const outSec = document.getElementById('output-section');
            if (outSec) {
                outSec.insertBefore(warnDiv, outSec.firstChild);
                setTimeout(() => { if(warnDiv.parentElement) warnDiv.remove(); }, 15000);
            }
        }
    }

    const fw = gv('firmware','uefi');
    const fs = gv('filesystem','btrfs');
    const disk = gv('target-disk','/dev/sda');
    /* Dual boot. Absent or 'none' keeps the previous behaviour exactly — a
       whole-disk install — which is what every existing config means. Anything
       else stops `sgdisk -Z` being emitted at all: that flag zaps the GPT and
       the MBR, so it does not spare an operating system it was not told about. */
    const dualboot = gv('dualboot','none');
    const isDual = dualboot !== 'none';
    const dualEspMode = gv('dualboot_esp_mode','separate');
    const dualEsp = gv('dualboot_esp','');
    const espShared = isDual && dualEspMode !== 'separate';
    /* Going first means the other system is not there yet, so there is no
       existing ESP to share and no existing bootloader to hand the menu to.
       Forced here as well as in the form, because a configuration can arrive
       from a file rather than from the controls. */
    const dualFirst = isDual && gv('dualboot_order', 'second') === 'first';
    const dualOwner = dualFirst ? 'this' : gv('dualboot_owner', 'this');
    const dualDefault = gv('dualboot_default', 'this');
    /* Defaults match the walkthrough's recommended answers, so a config that
       omits them produces the same system from either front end. */
    const timezone = gv('timezone','Europe/London');
    const locale = gv('locale','en_US.UTF-8');
    const keymap = gv('keymap','us');
    const part = gv('partitioning','luks2');
    const initSys = gv('init_system','systemd');
    // Encryption "layer" selections (base type is `part`, above).
    const enc_cipher = gv('encryption_cipher','aes-xts-plain64');
    const enc_pq = gv('encryption_pq','none');
    const luks_duress = gv('luks_duress_action','none');
    const luks_duress_decoy = gv('luks_duress_decoy','tty');
    const usb_kill = gv('usb_kill','none');
    const usb_kill_trigger = gv('usb_kill_trigger','new');
    const boot = gv('bootloader','uki-custom');
    const kernelMain = gv('kernel-main','linux-hardened');
    const kernelBackup = gv('kernel-backup','linux-zen');
    const software_type = gv('software_type','libre');
    const desktop = gv('desktop','none');
    const displayServer = gv('display_server','auto');
    // Wallpapers, matching the *nix Install Walkthrough's three questions so a config
    // from either front end configures the other.
    const wallpapers = gv('wallpapers','none');
    const wallpaperCount = gv('wallpaper_count','50');
    const wallpaperSplit = gv('wallpaper_split','75');
    const swap_size = gv('swap_size','8G');
    const cleanup = gv('cleanup','yes');
    const browser = gv('browser','none');
    const dns = gv('dns','systemd-resolved');
    const format = gv('outputformat','both');
    const user_count = gi('user_count',1);
    const root_ssh = gv('root_ssh','no');
    // NOTE: the OTP hash, double-OTP, bypass-uses and recovery-count questions
    // were removed. They were five separate ways to configure one mechanism, and
    // two of them (bypass password, recovery codes) are by definition ways around
    // the second factor. The generator now picks safe values: SHA-512 for the
    // silent tamper check, SHA-1 for interactive 2FA because that is what
    // authenticator apps can actually read, and no bypass password.
    const iso_setup = gv('iso_setup','none');
    const cpu_brand = gv('cpu_brand','amd');
    const gpu_brand = gv('gpu_brand','amd');
    const vm_guest = gv('vm_guest','none');
    const auto_updates = gv('auto_updates','no');
    const verbosity_level = gv('verbosity_level','normal');

    const configMode = document.getElementById('global_ask_toggle')?.checked ? 'preconfigured' : 'interactive';
    
    const isoVerify = gv('iso_verify', 'yes');
    const advDoasMode = gv('adv_doas_mode', 'both');
    const advThemeMode = gv('adv_theme_mode', 'tokyonight');
    const advAemMode = gv('adv_aem_mode', '1');
    const advSnapperMode = gv('adv_snapper_mode', 'default');

    const useCustomScripts = gv('use-custom-scripts','no') === 'yes';

    // Checkboxes arrays
    const post_apps = [];
    document.querySelectorAll('input[name="post_apps"]:checked').forEach(cb => post_apps.push(cb.value));

    const other_sec_tools = [];
    document.querySelectorAll('input[name="other_sec_tools"]:checked').forEach(cb => other_sec_tools.push(cb.value));

    const libreOtpMode = gv('libre_otp_mode','login');
    const webhook_provider = gv('webhook_provider','ntfy');
    const webhook_url = gv('webhook_url','');
    const aem_main = gv('aem-kernel-main','linux');
    const aem_backup = gv('aem-kernel-backup','none');

    const configJSON = configJSONString(getFormValues(), 'dynamic-generator');

    // ─── Validation ─────────────────────────────────────────────────────────
    // Kept deliberately quiet. Rather than listing every unset field, the offenders
    // are outlined in red and the box offers one "jump to next" control that walks
    // through them. If nothing has been filled in at all, it just says so, because
    // enumerating thirty untouched dropdowns is noise, not help.
    clearValidationState();

    /* Only fields the reader can actually see AND act on are required.

       Visibility alone is not enough. A control this form has disabled is one
       the form has already decided does not apply — choosing "All of them" for
       the wallpapers answers both the count and the split, so both are greyed
       out. They are still on screen, so an offsetParent test still counts them,
       and the "No Selection Provided" option injected at load leaves them with
       an empty value. Generation was refused with two options "still needing a
       value" and the walk-to-next control landed on two dropdowns that cannot
       be opened: a dead end with no way out of it from the page.

       Demanding a value from a control the reader cannot reach is never right,
       whatever put it in that state, so this is keyed on the state rather than
       on the wallpaper questions specifically. */
    const requiredSelects = Array.from(document.querySelectorAll('#install-form select'))
        .filter(sel => sel.offsetParent !== null && !sel.disabled);

    const missing = requiredSelects.filter(sel => !sel.value);

    // Conflicts are different from omissions: they need explaining, so they are
    // always spelled out (there are only ever one or two).
    const conflicts = [];
    if (fw === "bios" && boot !== "grub") {
        conflicts.push({
            el: document.getElementById('bootloader'),
            msg: 'Legacy BIOS can only boot GRUB — UKI and systemd-boot need UEFI.'
        });
    }
    if (fw === "bios" && part.includes("luks2")) {
        conflicts.push({
            el: document.getElementById('partitioning'),
            msg: 'GRUB on BIOS cannot reliably unlock LUKS2. Use LUKS1 instead.'
        });
    }

    // Apps with optional configuration the user never opened. These no longer
    // block generation: an unopened settings dialog is not an error, it just
    // means "I have no opinion". The recommended defaults are applied and the
    // user is told exactly which ones and what was chosen, so the behaviour is
    // never silent.
    const defaulted = applyRecommendedAppDefaults();

    const nothingTouched = missing.length === requiredSelects.length && requiredSelects.length > 0;
    const hasProblem = missing.length > 0 || conflicts.length > 0;

    if (hasProblem) {
        if (auto) return;   // never nag during background regeneration
        showValidationProblems({ missing, conflicts, unconfigured: [], nothingTouched });
        return;
    }
    
    hideValidationBox();

    // Default Profiles Check for Apps & Security
    const SECURITY_APP_VALUES = ['libre-otp', 'anti-ducky', 'anti-evil-maid',
                                 'kernel-watcher', 'scarecrow'];
    const hasApps = document.querySelectorAll('input[name="post_apps"]:checked').length > 0;
    const hasSec =
        SECURITY_APP_VALUES.some(v =>
            document.querySelector(`input[name="post_apps"][value="${v}"]`)?.checked) ||
        document.querySelectorAll('input[name="other_sec_tools"]:checked').length > 0;

    if (!hasApps || !hasSec) {
        // `auto` means this is a background regeneration — the preview being
        // refreshed after a form change, or on load. A modal confirm() there is
        // a dialog nobody asked for, appearing over a page they are still
        // reading, and it fired on every keystroke that triggered a rebuild.
        // The validation box above already returns early on `auto` for exactly
        // this reason; this branch was missed. Defaults are applied either way
        // and named in the summary, so nothing is applied silently.
        if (!auto && !confirm("You have not selected any Apps or Security Tools. Default minimal profiles will be automatically applied. Proceed?")) {
            return;
        }
        // Auto-tick minimal defaults if they agreed
        if (!hasApps) {
            const defApps = ['openssh', 'fastfetch'];
            defApps.forEach(val => {
                const cb = document.querySelector(`input[name="post_apps"][value="${val}"]`);
                if (cb) cb.checked = true;
            });
        }
        if (!hasSec) {
            const defSec = ['anti-ducky', 'anti-evil-maid'];
            defSec.forEach(val => {
                const cb = document.querySelector(`input[name="post_apps"][value="${val}"]`);
                if (cb) cb.checked = true;
            });
        }
    }

    // Partition paths
    /* On a whole-disk install this guide makes partitions 1 and 2, so both paths
       are known. On a dual boot only the ESP is known, because the reader gives
       it — the root partition number depends on what the other system already
       laid down. The derivation below matches the walkthrough's so the two front
       ends agree, and the emitted script checks the path rather than trusting
       it. Kept in step with `facts()` in manual-guide.js. */
    const pSep = disk.includes("nvme") || disk.includes("mmcblk") || disk.includes("loop") ? "p" : "";
    let partEfi = isDual && dualEsp ? dualEsp : disk + pSep + "1";
    let partRoot = disk + pSep + "2";

    // ── Proprietary Software Analysis ──
    // Local copy so the per-run additions below don't mutate the shared register.
    const propAppsDB = { ...PROPRIETARY_APPS };

    const selectedPropApps = post_apps.filter(app => propAppsDB[app]);
    if (gpu_brand === 'nvidia') selectedPropApps.push('nvidia');
    if (browser === 'chrome') {
        propAppsDB['chrome'] = 'Google Chrome is proprietary spyware. Chromium or LibreWolf is libre.';
        selectedPropApps.push('chrome');
    }

    // Strict Libre enforcement
    if (software_type === 'libre' && selectedPropApps.length > 0) {
        const reasons = selectedPropApps.map(a => `\n- ${a.toUpperCase()}: ${propAppsDB[a]}`).join('');
        if (!confirm(`⚠ STRICT LIBRE WARNING ⚠\n\nYou selected "Libre + Open Source 100% Only", but have selected software containing proprietary code:\n${reasons}\n\nDo you want to override your Libre setting and allow these proprietary blobs?`)) {
            return;
        }
    }

    /* The target system, resolved the same way the walkthrough resolves it:
       through os-meta.js, falling back to Arch when nothing has been chosen.
       Read here rather than at load time so that switching system in the header
       and pressing Generate produces output for the system now selected. */
    const osMeta = (typeof window.targetOS === 'function' && window.OS_META)
        ? window.OS_META[window.targetOS()] : null;
    const osKey = (typeof window.targetOS === 'function' && osMeta) ? window.targetOS() : 'arch';
    const osLabel = osMeta ? osMeta.label : 'Arch Linux';
    const osUnfinished = !!(osMeta && osMeta.complete === false);

    /* How this system installs, from os-install.js — the same lookup the
       walkthrough makes, so the two front ends cannot disagree about what a
       Gentoo install looks like.

       A system whose emitters are not written yet has no model and borrows
       Arch's commands rather than throwing, because throwing would take the
       read-only preview down with it. The guide then says so in as many words,
       and no reader can reach one of these anyway: setTargetOS() refuses to
       select an unfinished system. */
    const hasModel = window.osHasInstallModel ? window.osHasInstallModel(osKey) : (osKey === 'arch');
    const modelKey = hasModel ? osKey : 'arch';
    const M = window.osInstallModel ? window.osInstallModel(modelKey) : null;
    const isGentoo = !!(M && M.family === 'gentoo');
    /* A system that ships a filesystem image has no installer to script: there
       is nothing to partition, nothing to bootstrap and no chroot to enter.
       Keyed on the shape of the install rather than on the package manager,
       because a second Debian on ordinary hardware would share every apt
       command here and none of this. */
    const isImaged = !!(M && M.imaged);

    /* Gentoo's stage3 answer decides its init, which is why there is no
       separate profile question: one answer settles the tarball, the profile
       and every service command below. */
    const gentooStage3 = gv('gentoo_stage3', 'openrc');
    const gentooKernel = gv('gentoo_kernel', 'bin');
    const gentooBinpkgs = gv('gentoo_binpkgs', 'big');
    const gentooMakeopts = gv('gentoo_makeopts', 'nproc');
    const gentooUse = gv('gentoo_use', 'profile');
    const modelInit = isGentoo ? M.stage3.initFor(gentooStage3) : null;
    const I = window.osInitOf
        ? window.osInitOf(modelKey, { init_system: modelInit })
        : null;

    /* Per-system command shapes. On Arch every one of these resolves to exactly
       the string that was hard-coded here before, which is what keeps the
       permutation assertions meaningful while other systems are added. */
    const pkgOf = n => (window.osPkgName ? window.osPkgName(modelKey, n) : n);
    const pkgsOf = l => (window.osPkgNames ? window.osPkgNames(modelKey, l) : l);
    /* Install, skipping what is already present. */
    const instNeeded = l => M.install(pkgsOf(l));
    /* Install unconditionally — the form the post-install sections use. */
    const inst = l => M.installPlain(pkgsOf(l));
    /* Enabling a service is the one command that differs by init rather than by
       system, so it comes from the init table and takes the bare name. */
    const svc = u => (I ? I.enable(u) : 'systemctl enable ' + u);
    const svcNow = u => (I ? I.enableNow(u) : 'systemctl enable --now ' + u);
    const openrc = !!(I && I.label === 'OpenRC');
    /* A repeating job. systemd expresses it as a timer unit and OpenRC has no
       equivalent at all, so the same schedule becomes a cron entry — which is
       a real difference in what has to be installed, not a spelling of the same
       command. Callers give both, because only they know the schedule. */
    const repeating = (units, cronPath, cronLines, now) => {
        if (!openrc) return `systemctl enable ${now === false ? '' : '--now '}${units}`;
        /* printf rather than a heredoc: these are emitted inside indented shell
           functions in places, and an indented heredoc terminator ends nothing.
           One command on one line is safe wherever it lands. */
        return `printf '${cronLines.join('\\n')}\\n' > ${cronPath} && chmod 644 ${cronPath}`;
    };
    /* The snapshot schedule, which is two timer units on systemd and one cron
       file otherwise. Named because three separate places emit it. */
    const snapperTimeline = now => repeating(
        'snapper-timeline.timer snapper-cleanup.timer',
        '/etc/cron.d/snapper',
        ['0 * * * * root /usr/bin/snapper --config root create --description timeline --cleanup-algorithm timeline',
         '30 * * * * root /usr/bin/snapper --config root cleanup timeline'], now);
    /* Where the new system is mounted. Arch's installer works at /mnt; the
       Gentoo Handbook uses /mnt/gentoo throughout and the chroot commands in
       os-install.js are written against that path, so the two must agree. */
    const mntRoot = isGentoo ? '/mnt/gentoo' : '/mnt';
    /* Running one script inside the new system. Arch has a wrapper that does
       the bind mounts; Gentoo does them beforehand and then plain-chroots. */
    const chrootRun = f => (isGentoo ? `chroot ${mntRoot} /bin/bash ${f}` : `arch-chroot /mnt ${f}`);
    /* Published for the top-level builders called further down, which emit
       package and service commands of their own. */
    genOs = { key: modelKey, label: osLabel, model: M, init: I,
              openrc: openrc, gentoo: isGentoo, mnt: mntRoot };

    // Build output
    function buildOutput(cmdOnly) {
        let o = "";
        /* The answers, embedded so a saved guide or script can be loaded back in
           and carry on where it left off. Stripped from the preview; present in
           the raw source.

           The shape has to differ between the two outputs, and this is not
           cosmetic. `<!-- … -->` is a comment in markdown and a syntax error in
           shell: an HTML comment at the top of the .sh meant the downloaded
           install script did not parse at all — `bash -n` stopped on it before
           reading a single command. The script therefore gets the `###` form
           on one line, so the whole line is a shell comment, and it goes after
           the shebang because a shebang only works on line 1.

           `tryParseConfig()` already accepted both spellings; only the emitter
           was missing one. */
        const configObj = getFormValues();
        const configJSON = JSON.stringify(wrapConfig(configObj, 'dynamic-generator'));

        if (!cmdOnly) {
            o += '<!-- CONFIG_START\n' + configJSON + '\nCONFIG_END -->\n\n';
            o += `# Your Custom ${osLabel} Installation Guide\n\n`;
            /* Same banner, same wording and same position as the walkthrough's.
               A reader who reaches an unfinished guide through this front end
               instead of the other one is in exactly the same danger, and these
               commands repartition disks. */
            if (osUnfinished) {
                o += `> [!CAUTION]\n`;
                o += `> **🚧 The ${osLabel} guide is a work in progress and is NOT\n`;
                o += `> ready to install from.** It is published so it can be read and\n`;
                o += `> reviewed, not run. Commands may be missing, wrong, or in the wrong\n`;
                o += `> order, and running them could destroy data without producing a\n`;
                o += `> working system.\n>\n`;
                o += `> **Use the Arch Linux guide for an actual install.** It is the only\n`;
                o += `> complete one.\n>\n`;
                o += `> If you know ${osLabel} and want to help, corrections are very\n`;
                o += `> welcome: <https://github.com/tilas01/Unix-SIT/issues>\n\n`;
                o += `> The authority for ${osLabel} is ${osMeta.docsName}: <${osMeta.docs}>.\n`;
                o += `> Where this guide and that disagree, that is right and this is a bug\n`;
                o += `> worth reporting.\n\n`;
            }
            o += `> *Generated for your specific hardware. Review every command before running.*\n\n`;
            o += `## 1. Partitioning & Formatting (${part} + ${fs})\n\`\`\`bash\n`;
        } else {
            o += `#!/bin/bash\n`;
            o += `### CONFIG_START ${configJSON} ### CONFIG_END\n`;
            o += `# Generated Script\n# WARNING: Review ALL commands!\nset -e\n`;
            /* And in the script, because someone who skims the page and runs the
               file has not read the guide. A comment block rather than a prompt:
               the script is also read by people who pipe it somewhere. */
            if (osUnfinished) {
                o += `\n`;
                o += `# ======================================================================\n`;
                o += `# 🚧 WORK IN PROGRESS — NOT READY TO INSTALL FROM\n`;
                o += `# ======================================================================\n`;
                o += `# The ${osLabel} guide is unfinished. This script is published so it\n`;
                o += `# can be read and reviewed, not run. Commands may be missing, wrong,\n`;
                o += `# or in the wrong order, and running it could destroy data without\n`;
                o += `# producing a working system.\n`;
                o += `#\n`;
                o += `# Use the Arch Linux guide for an actual install. It is the only\n`;
                o += `# complete one. Authority for ${osLabel}: ${osMeta.docs}\n`;
                o += `# ======================================================================\n\n`;
            }
            if (verbosity_level === 'debug') o += `set -x\n`;
            if (verbosity_level === 'quiet') o += `exec >/dev/null\n`;
            o += `\n`;
            o += `export COLOR_BG="\\e[48;2;26;27;38m"\n`;
            o += `export COLOR_FG="\\e[38;2;192;202;245m"\n`;
            o += `export COLOR_RED="\\e[38;2;247;118;142m"\n`;
            o += `export COLOR_BLUE="\\e[38;2;122;162;247m"\n`;
            o += `export COLOR_RESET="\\e[0m"\n`;
            o += `echo -e "\${COLOR_BG}\${COLOR_FG}"\n`;
            o += `clear\n`;
            o += `echo -e "\${COLOR_BLUE}========================================================================\${COLOR_RESET}"\n`;
            o += `echo -e "\${COLOR_BLUE}             ARCH RUSTY SECURITY SUITE — AUTO-INSTALLER                 \${COLOR_RESET}"\n`;
            o += `echo -e "\${COLOR_BLUE}========================================================================\${COLOR_RESET}\n\n"\n`;
            if (verbosity_level === 'progress' || verbosity_level === 'simple') {
                o += `
# Setup animated progress bar function
run_with_progress() {
    local cmd="$1"
    local msg="$2"
    local pid
    eval "$cmd" >/dev/null 2>&1 &
    pid=$!
    
    local delay=0.1
    local width=20
    local pos=0
    local direction=1
    
    echo -e "\${COLOR_FG}\${msg}..."
    tput civis # hide cursor
    while kill -0 $pid 2>/dev/null; do
        # Build the bar
        local bar="["
        for ((i=0; i<width; i++)); do
            if [ $i -eq $pos ]; then
                bar+="="
            elif [ $i -eq $((pos-1)) ] || [ $i -eq $((pos+1)) ]; then
                bar+="-"
            else
                bar+=" "
            fi
        done
        bar+="]"
        
        echo -ne "\\r\${COLOR_BLUE}\${bar}\${COLOR_RESET}"
        
        # Bounce logic
        if [ $pos -eq $((width-1)) ]; then
            direction=-1
        elif [ $pos -eq 0 ]; then
            direction=1
        fi
        pos=$((pos+direction))
        
        sleep $delay
    done
    wait $pid
    local exit_code=$?
    tput cnorm # restore cursor
    
    if [ $exit_code -eq 0 ]; then
        echo -e "\\r[====================] [\${COLOR_GREEN}DONE\${COLOR_RESET}]"
    else
        echo -e "\\r[                    ] [\${COLOR_RED}FAILED\${COLOR_RESET}]"
        exit $exit_code
    fi
}
`;
            }

            
            if (configMode === 'preconfigured') {
                o += `echo -e "\${COLOR_RED}[!] WALK-AWAY AUTOMATION: Collecting Credentials Upfront\${COLOR_RESET}"\n`;
                o += `echo -e "\${COLOR_FG}This script will cache your passwords into volatile memory to perform a completely unattended installation.\${COLOR_RESET}"\n`;
                o += `echo "All passwords will be securely wiped (unset) immediately upon completion."\n\n`;
                if (part !== "unencrypted") {
                    o += `read -s -p "Enter LUKS Encryption Password: " LUKS_PASS\necho\n`;
                    o += `read -s -p "Confirm LUKS Password: " LUKS_PASS2\necho\n`;
                    o += `if [ "$LUKS_PASS" != "$LUKS_PASS2" ]; then echo "Passwords do not match!"; exit 1; fi\n\n`;
                }
                o += `read -s -p "Enter Root Password: " ROOT_PASS\necho\n`;
                o += `read -s -p "Confirm Root Password: " ROOT_PASS2\necho\n`;
                o += `if [ "$ROOT_PASS" != "$ROOT_PASS2" ]; then echo "Passwords do not match!"; exit 1; fi\n\n`;
                for (let u = 1; u <= user_count; u++) {
                    o += `read -p "Enter Username ${u}: " USER_NAME_${u}\n`;
                    o += `read -s -p "Enter password for $USER_NAME_${u}: " USER_PASS_${u}\necho\n`;
                    o += `read -s -p "Confirm password for $USER_NAME_${u}: " USER_PASS2_${u}\necho\n`;
                    o += `if [ "$USER_PASS_${u}" != "$USER_PASS2_${u}" ]; then echo "Passwords do not match!"; exit 1; fi\n\n`;
                }
                o += `echo -e "\\e[32m[+] Credentials cached securely. Starting unattended installation...\\e[0m"\nsleep 2\n\n`;
            }

            /* A console font large enough to read the passphrase prompt on a
               high-resolution panel. A TTY can only use PSF fonts, so this is
               terminus rather than the font the installed system will use.

               Only Arch's installer needs the package fetched: Gentoo's admin
               CD already carries terminus, and reaching for a package manager
               inside somebody else's live environment is how a guide starts
               issuing commands that do not exist there. */
            if (isGentoo || isImaged) {
                /* Neither reaches for a package manager here. Gentoo's admin CD
                   already carries terminus, and an imaged system is not in a
                   live environment at all — it is the installed system, where
                   pulling a console font in before the first upgrade is work
                   for no gain. `|| true` because a board on a serial console
                   has no font to set and that is not a failure. */
                o += `setfont ter-v24b 2>/dev/null || true\n\n`;
            } else {
                o += `pacman -Sy --noconfirm terminus-font\nsetfont ter-v24b\n\n`;
            }
            
            o += `# 1. Partitioning\n`;
        }

        // Partitioning
        if (cmdOnly) {
            o += `echo -e "\\n\${COLOR_BLUE}:: Step 1: Disk Partitioning & Formatting\${COLOR_RESET}"\n`;
            o += `echo -e "\${COLOR_FG}Target: ${disk} | Firmware: ${fw.toUpperCase()}\${COLOR_RESET}"\n`;
            o += `echo -e "\${COLOR_FG}Wiping partition tables and structuring for Arch Linux. UEFI requires an EFI system partition.\${COLOR_RESET}"\n`;
            o += `echo -e "\${COLOR_FG}Wiki: https://wiki.archlinux.org/title/Partitioning\${COLOR_RESET}"\n`;
        }
        if (isDual) {
            /* Never `sgdisk -Z` here. That zaps the GPT and the MBR, so it
               destroys the operating system the reader just said they were
               keeping. Partitions are added to free space instead, and the
               script refuses to continue if the paths it was given are not
               what is actually on the disk — a wrong path here is the
               difference between an install and a lost Windows partition. */
            o += `# Dual boot: ${dualboot}. The partition table is NOT wiped.\n`;
            if (dualFirst) {
                /* Going first is the easier order and the reason to offer it:
                   the second installer meets free space instead of the reader
                   shrinking a filesystem that already holds their data. It only
                   works if the space is left now — reclaiming it later is the
                   shrink this ordering exists to avoid. */
                o += `# This system goes on FIRST. The root partition below is sized to leave\n`;
                o += `# room for ${dualboot}; the space stays unpartitioned until that\n`;
                o += `# installer claims it.\n`;
            } else {
                o += `# Shrink the other system's partition from that system's own tools\n`;
                o += `# first, then create the partitions below in the free space.\n`;
            }
            if (dualboot === 'windows') {
                /* These happen in Windows, before this script ever runs. They
                   are comments rather than commands for that reason — but
                   leaving them out entirely is how somebody resizes a
                   hibernated NTFS volume and corrupts it. */
                o += `#\n`;
                o += `# BEFORE YOU BOOTED THIS INSTALLER, in Windows as administrator:\n`;
                o += `#   powercfg /h off                       # Fast Startup leaves NTFS\n`;
                o += `#                                         # hibernated; resizing it then\n`;
                o += `#                                         # corrupts the filesystem.\n`;
                o += `#   manage-bde -status                    # is BitLocker on? Recent Windows\n`;
                o += `#                                         # enables Device Encryption itself,\n`;
                o += `#                                         # key in your Microsoft account.\n`;
                o += `#   manage-bde -protectors -disable C:    # suspend it. WRITE THE RECOVERY\n`;
                o += `#                                         # KEY DOWN FIRST, off this machine.\n`;
                o += `#   Then a full Restart, not Shut down.\n`;
                o += `#\n`;
                o += `# AFTER the install, boot Windows once and re-enable it:\n`;
                o += `#   manage-bde -protectors -enable C:\n`;
                o += `#   manage-bde -status C:                 # want: Protection On\n`;
                o += `#\n`;
            }
            o += `lsblk -o NAME,SIZE,FSTYPE,PARTTYPENAME ${disk}\n`;
            o += `echo "Check the layout above before continuing."\n\n`;
            if (fw === "uefi" && !espShared) {
                o += `# Your own EFI partition, so the other system's is untouched.\n`;
                o += `sgdisk -n 0:0:+512M -t 0:ef00 -c 0:"LINUXESP" ${disk}\n`;
            }
            if (dualFirst) {
                /* Taking the rest of the disk is exactly what must not happen
                   here. A variable checked before use reads as a blank to fill
                   and stops the script rather than quietly consuming the space
                   the other system was supposed to get. */
                o += `# The size of THIS system's root partition. Everything after it is left\n`;
                o += `# unpartitioned for ${dualboot}.\n`;
                o += `THIS_SYSTEM_SIZE=""     # e.g. 200G\n`;
                o += `if [ -z "$THIS_SYSTEM_SIZE" ]; then\n`;
                o += `    echo "Set THIS_SYSTEM_SIZE to how much of ${disk} this system should take." >&2\n`;
                o += `    echo "The remainder is left free for ${dualboot}." >&2\n`;
                o += `    exit 1\n`;
                o += `fi\n`;
                o += `sgdisk -n 0:0:+"$THIS_SYSTEM_SIZE" -t 0:8300 ${disk}\n`;
            } else {
                o += `sgdisk -n 0:0:0 -t 0:8300 ${disk}\n`;
            }
            o += `partprobe ${disk}\nsleep 2\n\n`;
            o += `# Fail closed: these must already exist, and the ESP must not be the\n`;
            o += `# other system's unless sharing was chosen deliberately.\n`;
            o += `for p in "${partEfi}" "${partRoot}"; do\n`;
            o += `    [ -b "$p" ] || { echo "No such partition: $p. Check lsblk." >&2; exit 1; }\n`;
            o += `done\n`;
            if (espShared) {
                o += `echo "Sharing ${partEfi} — it is mounted, never formatted."\n`;
            } else if (fw === "uefi") {
                o += `mkfs.fat -F32 -n LINUXESP ${partEfi}\n`;
            }
        } else if (fw === "uefi") {
            o += `sgdisk -Z ${disk}\nsgdisk -n 1:0:+512M -t 1:ef00 ${disk}\nsgdisk -n 2:0:0 -t 2:8300 ${disk}\n`;
            o += `partprobe ${disk}\nsleep 2\nmkfs.fat -F32 ${partEfi}\n`;
        } else {
            o += `sgdisk -Z ${disk}\nsgdisk -n 1:0:+2M -t 1:ef02 ${disk}\nsgdisk -n 2:0:0 -t 2:8300 ${disk}\npartprobe ${disk}\nsleep 2\n`;
        }

        let targetMount = partRoot;
        // Post-quantum overlay is experimental; warn loudly in the script itself.
        const pqWarn = enc_pq === "kyber1024"
            ? `echo -e "\\e[1;31m[!] WARNING: KYBER-1024 PQ OVERLAY ENABLED (EXPERIMENTAL) - may prevent boot\\e[0m"\n`
            : "";
        if (part !== "unencrypted") o += pqWarn;

        if (part === "luks1") {
            if (cmdOnly) o += `echo -e "\\n\${COLOR_BLUE}:: Encrypting with LUKS1\${COLOR_RESET}\\n\${COLOR_FG}Using legacy LUKS1 to support GRUB decryption. AES-XTS-512 encryption.\\nWiki: https://wiki.archlinux.org/title/Dm-crypt\${COLOR_RESET}"\n`;
            o += `echo -n "$LUKS_PASS" | cryptsetup luksFormat --type luks1 -c ${enc_cipher} -s 512 -h sha512 - ${partRoot}\n`;
            o += `LUKS_UUID=$(blkid -s UUID -o value ${partRoot})\n`;
            o += `cryptsetup open UUID=$LUKS_UUID cryptroot\n`;
            targetMount = "/dev/mapper/cryptroot";
        } else if (part === "luks2") {
            if (cmdOnly) o += `echo -e "\\n\${COLOR_BLUE}:: Encrypting with LUKS2\${COLOR_RESET}\\n\${COLOR_FG}Using modern LUKS2 with Argon2id key derivation. Extremely resistant to brute force.\\nWiki: https://wiki.archlinux.org/title/Dm-crypt\${COLOR_RESET}"\n`;
            o += `echo -n "$LUKS_PASS" | cryptsetup luksFormat --type luks2 --cipher ${enc_cipher} --key-size 512 --hash sha512 --pbkdf argon2id --iter-time 5000 - ${partRoot}\n`;
            o += `LUKS_UUID=$(blkid -s UUID -o value ${partRoot})\n`;
            o += `cryptsetup open UUID=$LUKS_UUID cryptroot\n`;
            targetMount = "/dev/mapper/cryptroot";
        } else if (part.includes("lvm")) {
            
        let luksType = part.includes("luks1") ? "luks1" : "luks2";
        let pbkdf = luksType === "luks2" ? "--pbkdf argon2id --iter-time 2000" : "--pbkdf pbkdf2";
        
        o += `echo -n "$LUKS_PASS" | cryptsetup luksFormat --type ${luksType} --cipher ${enc_cipher} --key-size 512 ${pbkdf} - ${partRoot}\n`;

            o += `LUKS_UUID=$(blkid -s UUID -o value ${partRoot})\n`;
            o += `cryptsetup open UUID=$LUKS_UUID cryptlvm\npvcreate /dev/mapper/cryptlvm\nvgcreate vg0 /dev/mapper/cryptlvm\nlvcreate -l 100%FREE vg0 -n root\n`;
            targetMount = "/dev/vg0/root";
        }

        if (fs === "btrfs") {
            if (cmdOnly) o += `echo -e "\\n\${COLOR_BLUE}:: Formatting as BTRFS\${COLOR_RESET}\\n\${COLOR_FG}BTRFS supports subvolumes and atomic snapshots. This enables instant system rollbacks.\\nWiki: https://wiki.archlinux.org/title/Btrfs\${COLOR_RESET}"\n`;
            o += `mkfs.btrfs -f ${targetMount}\nmount ${targetMount} /mnt\nbtrfs subvolume create /mnt/@\nbtrfs subvolume create /mnt/@home\nbtrfs subvolume create /mnt/@var\nbtrfs subvolume create /mnt/@snapshots\numount /mnt\n`;
            o += `ROOT_UUID=$(blkid -s UUID -o value ${targetMount})\n`;
            o += `mount -o noatime,compress=zstd,space_cache=v2,subvol=@ UUID=$ROOT_UUID /mnt\nmkdir -p /mnt/{home,var,.snapshots}\nmount -o noatime,compress=zstd,space_cache=v2,subvol=@home UUID=$ROOT_UUID /mnt/home\nmount -o noatime,compress=zstd,space_cache=v2,subvol=@var UUID=$ROOT_UUID /mnt/var\nmount -o noatime,compress=zstd,space_cache=v2,subvol=@snapshots UUID=$ROOT_UUID /mnt/.snapshots\n`;
        } else if (fs === "xfs") {
            o += `mkfs.xfs -f ${targetMount}\nROOT_UUID=$(blkid -s UUID -o value ${targetMount})\nmount UUID=$ROOT_UUID /mnt\n`;
        } else {
            o += `mkfs.ext4 ${targetMount}\nROOT_UUID=$(blkid -s UUID -o value ${targetMount})\nmount UUID=$ROOT_UUID /mnt\n`;
        }

        if (fw === "uefi") {
            o += `mkdir -p /mnt/efi\nEFI_UUID=$(blkid -s UUID -o value ${partEfi})\nmount UUID=$EFI_UUID /mnt/efi\n`;
        }

        if (swap_size !== "0") {
            if (fs === "btrfs") o += `btrfs filesystem mkswapfile --size ${swap_size} /mnt/swapfile\n`;
            else o += `fallocate -l ${swap_size} /mnt/swapfile\nchmod 600 /mnt/swapfile\nmkswap /mnt/swapfile\n`;
            o += `swapon /mnt/swapfile\n`;
        }

        // ── LUKS header verification ──
        // Confirm the volume really is the LUKS type and cipher that was asked
        // for, before anything is written on top of it.
        if (part !== "unencrypted") {
            if (!cmdOnly) {
                o += `\`\`\`\n\n### Verify the LUKS header\n` +
                     `> Confirm the container matches what you selected before continuing. ` +
                     `\`luksDump\` prints the header; the \`grep\` calls fail loudly if the ` +
                     `type or cipher is not what you asked for.\n\n\`\`\`bash\n`;
            } else {
                o += `\necho -e "\${COLOR_BLUE}:: Verifying LUKS header\${COLOR_RESET}"\n`;
            }
            const luksTypeCheck = part === 'luks1' ? 'LUKS1' : 'LUKS2';
            o += `cryptsetup luksDump ${partRoot}\n`;
            o += `cryptsetup isLuks --type ${part === 'luks1' ? 'luks1' : 'luks2'} ${partRoot} \\\n`;
            o += `  || { echo "FATAL: ${partRoot} is not a ${luksTypeCheck} volume"; exit 1; }\n`;
            o += `cryptsetup luksDump ${partRoot} | grep -q "${enc_cipher}" \\\n`;
            o += `  || { echo "FATAL: cipher is not ${enc_cipher}"; exit 1; }\n`;
            o += `echo "LUKS header verified: ${luksTypeCheck} / ${enc_cipher}"\n`;
        }

        // ── LUKS duress passphrase ──
        if (part !== "unencrypted" && luks_duress !== "none") {
            o += buildLuksDuress(luks_duress, luks_duress_decoy, partRoot, cmdOnly);
        }

        if (!cmdOnly) o += `\`\`\`\n\n## 2. Base Installation\n\`\`\`bash\n`;
        else o += `\n# 2. Base Installation\n`;

        let cpuPkg = cpu_brand === "amd" ? "amd-ucode" : (cpu_brand === "intel" ? "intel-ucode" : "");
        let gpuPkg = "";
        if (gpu_brand === "amd") gpuPkg = "mesa xf86-video-amdgpu vulkan-radeon";
        else if (gpu_brand === "intel") gpuPkg = "mesa xf86-video-intel vulkan-intel";
        else if (gpu_brand === "nvidia") gpuPkg = (software_type === "libre" || software_type === "opensource") ? "mesa xf86-video-nouveau" : "nvidia nvidia-utils";
        else if (gpu_brand === "vm") gpuPkg = "spice-vdagent xf86-video-qxl";

        let vmPkg = vm_guest === "vbox" ? "virtualbox-guest-utils" : (vm_guest === "vmware" ? "open-vm-tools" : (vm_guest === "qemu" ? "qemu-guest-agent" : ""));
        let adminTools = software_type === "libre" ? "opendoas pfetch cronie" : "sudo fastfetch cronie";
        let fsPkg = fs === "btrfs" ? "btrfs-progs snapper" : (fs === "xfs" ? "xfsprogs" : "");
        let allKernels = kernelMain + " " + kernelMain + "-headers";
        if (kernelBackup !== "none") allKernels += " " + kernelBackup + " " + kernelBackup + "-headers";

        if (isGentoo) {
            /* Not pacstrap with different words. Gentoo's base system is a
               signed tarball that gets verified and unpacked by hand, the
               chroot is assembled by hand because there is no arch-chroot, and
               the compile options have to be settled before anything is built.
               Same sequence, same reasoning and the same commands as the
               walkthrough emits, because both read os-install.js.

               Everything inside a ```bash fence is lifted into the runnable
               script, so a placeholder has to be valid shell as well as
               readable: an angle-bracket placeholder is a redirection and makes
               the whole file unparseable. A variable checked before use reads as
               a blank to fill and fails closed. */
            if (cmdOnly) o += `echo -e "\\n\${COLOR_BLUE}:: Step 2: Base System (stage3 tarball)\${COLOR_RESET}\\n\${COLOR_FG}Verifying and unpacking the stage3 tarball, then assembling the chroot.\\nHandbook: ${M.authority}\${COLOR_RESET}"\n`;
            o += `mkdir -p /mnt/gentoo\ncd /mnt/gentoo\n`;
            o += `# Pick a mirror:  ${M.stage3.mirrorList}\n`;
            o += `# Newest tarball under:\n`;
            o += `#   releases/amd64/autobuilds/${M.stage3.dirFor(gentooStage3)}/\n`;
            o += `STAGE3_URL=""     # paste the full tarball URL here\n`;
            o += `if [ -z "$STAGE3_URL" ]; then\n`;
            o += `    echo "Set STAGE3_URL to the stage3 tarball you chose." >&2\n`;
            o += `    exit 1\n`;
            o += `fi\n`;
            o += `wget "$STAGE3_URL"\n`;
            o += `wget "$STAGE3_URL.asc"\n`;
            /* The tarball becomes every binary on the machine, so a substituted
               one is not a corrupted download — it is a system that belongs to
               somebody else from first boot. */
            o += `# Do not skip the signature: this tarball becomes every binary\n`;
            o += `# on the machine.\n`;
            o += `${M.stage3.keyImport}\n`;
            o += `${M.stage3.verify('stage3-*.tar.xz')}\n`;
            o += `${M.stage3.unpack('stage3-*.tar.xz')}\n`;
            o += `# -p and --xattrs-include keep permissions and extended attributes,\n`;
            o += `# --numeric-owner keeps the ids as built rather than remapping them to\n`;
            o += `# whatever the live environment calls them.\n`;

            o += `\n# Compile options, from your answers\n`;
            o += `cat >> /mnt/gentoo/etc/portage/make.conf <<'MAKECONF'\n`;
            o += `COMMON_FLAGS="-O2 -pipe -march=native"\n`;
            o += `MAKEOPTS="${M.makeopts[gentooMakeopts] || M.makeopts.nproc}"\n`;
            const gUseLine = M.useSets[gentooUse] !== undefined ? M.useSets[gentooUse] : M.useSets.profile;
            if (gUseLine) o += `${gUseLine}\n`;
            if (gentooBinpkgs === 'all') o += `FEATURES="getbinpkg"\n`;
            o += `MAKECONF\n`;
            if (gentooMakeopts === 'half') {
                o += `# Half the cores, because a build job can want around 2 GB of RAM when\n`;
                o += `# it links. This keeps a long build away from the OOM killer.\n`;
            } else if (gentooMakeopts === '1') {
                o += `# One job at a time. Slowest, and the one that always finishes.\n`;
            }
            o += `# -march=native builds for the CPU doing the building. Do not use it if\n`;
            o += `# this disk will be moved to another machine.\n`;

            o += `\n# The chroot, assembled by hand\n`;
            M.chrootPrep.forEach(c => { o += `${c}\n`; });
            o += `cp --dereference /etc/resolv.conf /mnt/gentoo/etc/\n`;
        } else if (isImaged) {
            /* The image is the base system. Nothing is installed here, so what
               would have been the bootstrap step is the two things that do have
               to happen on a freshly written card: grow the root filesystem to
               the card it was actually written to, and take everything
               published since the image was built. */
            if (cmdOnly) o += `echo -e "\\n\${COLOR_BLUE}:: Step 2: First boot\${COLOR_RESET}\\n\${COLOR_FG}The image already holds the base system. Expanding the root filesystem to fill the card, then upgrading.\\nDocs: ${M.authority}\${COLOR_RESET}"\n`;
            o += `# The image is sized for the smallest supported card, so the root\n`;
            o += `# filesystem does not fill the one you actually used.\n`;
            o += `${M.imaged.expand}\n`;
            o += `${M.upgrade}\n`;
        } else {
            if (cmdOnly) o += `echo -e "\\n\${COLOR_BLUE}:: Step 2: Base System Installation (pacstrap)\${COLOR_RESET}\\n\${COLOR_FG}Downloading and installing the base OS, kernel (${kernelMain}), drivers, and essential tools.\\nWiki: https://wiki.archlinux.org/title/Installation_guide#Install_essential_packages\${COLOR_RESET}"\n`;
            if (verbosity_level === 'progress') {
                o += `run_with_progress "pacstrap -K /mnt base ${allKernels} ${cpuPkg} ${gpuPkg} ${vmPkg} linux-firmware neovim ${adminTools} git ${fsPkg}" "Installing Base System"\n`;
            } else if (verbosity_level === 'simple') {
                o += `pacstrap -K /mnt base ${allKernels} ${cpuPkg} ${gpuPkg} ${vmPkg} linux-firmware neovim ${adminTools} git ${fsPkg} >/dev/null 2>&1\n`;
            } else {
                o += `pacstrap -K /mnt base ${allKernels} ${cpuPkg} ${gpuPkg} ${vmPkg} linux-firmware neovim ${adminTools} git ${fsPkg}\n`;
            }
            o += `${M.fstab}\n`;
        }
          
          if (isoVerify === 'yes' && isGentoo) {
              /* The block below is Arch's: archiso's mount point, Arch's
                 keyring, Arch's signature file. None of it exists on a Gentoo
                 install medium, and a verification that silently checks the
                 wrong thing is worse than none — so the real procedure is named
                 instead of an approximation being run. */
              o += `\n# ==========================================\n`;
              o += `# Live medium integrity — Gentoo\n`;
              o += `# ==========================================\n`;
              o += `# Gentoo publishes a .DIGESTS and a .asc beside every install image,\n`;
              o += `# signed by the Gentoo release key. Verify the file you downloaded\n`;
              o += `# BEFORE writing it, on the machine you downloaded it with:\n`;
              o += `#   ${M.stage3.keyImport}\n`;
              o += `#   gpg --verify install-amd64-minimal-*.iso.asc\n`;
              o += `#   sha512sum -c install-amd64-minimal-*.iso.DIGESTS\n`;
              o += `# There is no equivalent of archiso's bootmnt to check from inside a\n`;
              o += `# running Gentoo medium, which is why this is a step you take earlier\n`;
              o += `# rather than a command here.\n`;
          } else if (isoVerify === 'yes' && isImaged) {
              /* There is no live medium to check from the inside. The image was
                 written to a card from another machine, and by the time any of
                 this runs the board has already booted from it — so the only
                 verification that means anything happened before the write, not
                 now. Saying that is more use than a check that cannot fail. */
              o += `\n# ==========================================\n`;
              o += `# Image integrity — ${osLabel}\n`;
              o += `# ==========================================\n`;
              o += `# Nothing to verify from here: this is the installed system, not a\n`;
              o += `# live medium, and the image it came from is no longer on the card in\n`;
              o += `# the form that was published. Verification is a step you take before\n`;
              o += `# writing the card:\n`;
              o += `#   sha256sum -c <image>.img.xz.sha256\n`;
              o += `# The imaging tool also verifies the write itself; leave that on.\n`;
              o += `# Docs: ${M.authority}\n`;
          } else if (isoVerify === 'yes') {
              o += `\n# ==========================================\n`;
              o += `# Live ISO Integrity Verifier (Ventoy/Rufus)\n`;
              o += `# ==========================================\n`;
              o += `echo -e "\\e[38;2;122;162;247m>> Verifying booted Arch Linux medium integrity...\\e[0m"\n`;
              o += `pacman-key --init >/dev/null 2>&1 && pacman-key --populate archlinux >/dev/null 2>&1\n`;
              o += `\n# Download latest Arch Linux release signatures\n`;
              o += `curl -sLO https://archlinux.org/iso/latest/archlinux-x86_64.iso.sig\n`;
              o += `\n# Detect boot medium (Ventoy partition vs Rufus/dd block device)\n`;
              o += `BOOT_DEV=$(findmnt -n -o SOURCE /run/archiso/bootmnt || echo "")\n`;
              o += `if [[ -n "$BOOT_DEV" ]]; then\n`;
              o += `  echo "Detected boot device: $BOOT_DEV"\n`;
              o += `  # Attempt to verify the raw block device (Rufus/Balena dd mode)\n`;
              o += `  if gpg --verify archlinux-x86_64.iso.sig "$BOOT_DEV" 2>/dev/null; then\n`;
              o += `    echo -e "\\e[32m[PASS] Integrity Verified! Your booted medium is officially signed by Arch Linux.\\e[0m"\n`;
              o += `  else\n`;
              o += `    echo -e "\\e[33m[WARN] Raw block device verification failed. Checking for Ventoy/ISO files...\\e[0m"\n`;
              o += `    ISO_FILE=$(find /run/archiso/bootmnt -maxdepth 3 -name "archlinux*.iso" 2>/dev/null | head -n 1)\n`;
              o += `    if [[ -n "$ISO_FILE" ]]; then\n`;
              o += `      if gpg --verify archlinux-x86_64.iso.sig "$ISO_FILE"; then\n`;
              o += `        echo -e "\\e[32m[PASS] ISO Integrity Verified! Your booted medium is secure.\\e[0m"\n`;
              o += `      else\n`;
              o += `        echo -e "\\e[31m[ERROR] ISO Signature verification failed! Your boot medium may be compromised.\\e[0m"\n`;
              o += `        read -p "Press Enter to acknowledge and continue at your own risk, or Ctrl+C to abort..." ack\n`;
              o += `      fi\n`;
              o += `    else\n`;
              o += `      echo -e "\\e[33m[WARN] Could not locate base ISO file to verify.\\e[0m"\n`;
              o += `    fi\n`;
              o += `  fi\n`;
              o += `else\n`;
              o += `  echo -e "\\e[33m[WARN] Could not detect archiso bootmnt. Skipping verification.\\e[0m"\n`;
              o += `fi\n`;
          }

        if (cmdOnly) {
            o += `\ncat << 'EOF' > ${mntRoot}/chroot_script.sh\n#!/bin/bash\nexport COLOR_BLUE="\\e[38;2;122;162;247m"\nexport COLOR_RESET="\\e[0m"\n`;
            o += `echo -e "\${COLOR_BLUE}>> ENTERING CHROOT: Post-Install Configuration...\${COLOR_RESET}"\n`;

                if (isGentoo) {
                    /* Inside the chroot and before anything else: the profile
                       environment, a package tree, and the profile itself. The
                       stage3 answer decides which profile number to look for,
                       which is why there is no separate question for it —
                       choosing the systemd profile over an OpenRC tarball is
                       the most common way a first Gentoo install goes wrong. */
                    M.chrootAfter.forEach(c => { o += `${c}\n`; });
                    o += `\n# A package tree, then the profile\n`;
                    o += `emerge-webrsync\n`;
                    o += `eselect profile list\n`;
                    o += `# Pick the number matching your stage3 (${gentooStage3}), then run:\n`;
                    o += `#   eselect profile set NUMBER\n`;
                    o += `# The profile sets the default USE flags, the init system and the\n`;
                    o += `# toolchain defaults.\n`;

                    /* The base system, as packages rather than as a tarball
                       transaction: everything Arch got from pacstrap that the
                       stage3 does not already provide. Names come from the
                       translation table, and anything Gentoo has no equivalent
                       for is named rather than quietly dropped. */
                    const gBase = [];
                    if (cpuPkg) gBase.push(cpuPkg);
                    gBase.push('linux-firmware');
                    gBase.push(software_type === 'libre' ? 'opendoas' : 'sudo');
                    gBase.push('cronie', 'git', 'vim');
                    if (fs === 'btrfs') gBase.push('btrfs-progs', 'snapper');
                    else if (fs === 'xfs') gBase.push('xfsprogs');
                    if (part !== 'unencrypted') gBase.push('cryptsetup');
                    if (part.includes('lvm')) gBase.push('lvm2');
                    const gBaseMapped = pkgsOf(gBase);
                    o += `\n# The base system beyond the stage3 tarball\n`;
                    if (gBaseMapped.length) o += `${instNeeded(gBase)}\n`;
                    const gMissing = window.osPkgUnavailable
                        ? window.osPkgUnavailable(modelKey, gBase) : [];
                    if (gMissing.length) {
                        o += `# Not installed here, because Gentoo has no equivalent package:\n`;
                        o += `#   ${gMissing.join(', ')}\n`;
                        o += `# The stage3 tarball already provides the base system, and zram is\n`;
                        o += `# configured through Gentoo's own init scripts.\n`;
                    }

                    /* The kernel, which on Gentoo is a decision rather than a
                       package that arrives with the base system. */
                    o += `\n# The kernel (${gentooKernel})\n`;
                    if (gentooKernel === 'manual') {
                        o += `${instNeeded(M.kernelPkgs.manual)}\n`;
                        o += `cd /usr/src/linux\n`;
                        o += `make menuconfig\n`;
                        o += `make -j$(nproc) && make modules_install\n`;
                        o += `make install\n`;
                        o += `# A configuration missing the driver for your disk controller, your\n`;
                        o += `# filesystem or dm-crypt will not boot and will not say which one\n`;
                        o += `# is absent. Check those three before leaving menuconfig.\n`;
                    } else if (gentooKernel === 'dist') {
                        o += `${instNeeded(M.kernelPkgs.dist)}\n`;
                    } else {
                        o += `${instNeeded(M.kernelPkgs.bin)}\n`;
                    }
                    if (gentooBinpkgs === 'big') {
                        o += `# Binaries for the big ones only: add --getbinpkg for the handful\n`;
                        o += `# nobody sensibly compiles — firefox, libreoffice, chromium, rust,\n`;
                        o += `# llvm. Chromium alone can be most of a day on a laptop.\n`;
                    } else if (gentooBinpkgs === 'none') {
                        o += `# Everything from source. Plan the first install as an overnight\n`;
                        o += `# job; a desktop with a browser is the long pole by a wide margin.\n`;
                    }

                    /* fstab is written by hand here — M.fstab is null for a
                       reason, and a skipped section would leave a system that
                       cannot mount its own filesystems. */
                    o += `\n# fstab, written by hand: Gentoo has no genfstab\n`;
                    o += `blkid\n`;
                    o += `# Write /etc/fstab yourself from the UUIDs above — root, ${M.espMount}\n`;
                    o += `# and any swap — then read it back before you trust it.\n`;
                }

                /* Locale, time zone and console keymap.
                   These were absent from this generator entirely: no zoneinfo
                   symlink, no locale-gen, no /etc/locale.conf, no vconsole.conf.
                   The Arch Wiki treats generating a locale as a required step,
                   so the script was producing an incomplete system — and the
                   keymap is not cosmetic either, because it decides how the
                   disk passphrase types at the boot prompt. */
                o += `\n# Time zone, locale and console keymap\n`;
                o += `ln -sf /usr/share/zoneinfo/${timezone} /etc/localtime\n`;
                o += `hwclock --systohc\n`;
                o += `sed -i 's/^#${locale}/${locale}/' /etc/locale.gen\n`;
                o += `locale-gen\n`;
                o += `echo "LANG=${locale}" > /etc/locale.conf\n`;
                /* Where the console keymap is recorded depends on the init, not
                   on the distribution: vconsole.conf is read by systemd, and an
                   OpenRC system would silently ignore it. This is the keymap the
                   disk passphrase is typed with, so a file nothing reads means a
                   prompt that will not accept the passphrase. */
                if (I && I.label === 'OpenRC') {
                    o += `echo 'keymap="${keymap}"' > /etc/conf.d/keymaps\n`;
                } else {
                    o += `echo "KEYMAP=${keymap}" > /etc/vconsole.conf\n`;
                }
                if (isDual && dualboot === 'windows') {
                    o += `# Windows keeps the hardware clock in local time and expects the same\n`;
                    o += `# from Linux. hwclock --systohc above writes UTC, which is the\n`;
                    o += `# standards-compliant side; set RealTimeIsUniversal to DWORD 1 in\n`;
                    o += `# Windows to make the two agree instead of drifting by your offset.\n`;
                }

                // Interactive prompts for root and user (Passwords are never stored in plaintext)
                o += `\n# Set Root Password\n`;
                if (!cmdOnly) {
                    o += `> **Note:** The passwords below are censored in this guide for your security.\n\n`
                    o += `passwd root\n`;
                } else {
                    o += `echo "root:$ROOT_PASS" | chpasswd\n`;
                }

                for (let u = 1; u <= user_count; u++) {
                    o += `\n# Set User ${u} Account\n`;
                    if (!cmdOnly) {
                        o += `useradd -m -G wheel -s /bin/bash "${gv('user_name_'+u, 'user'+u)}"\n`;
                        o += `passwd "${gv('user_name_'+u, 'user'+u)}"\n`;
                    } else {
                        if (configMode === 'preconfigured') {
                            o += `useradd -m -G wheel -s /bin/bash "$USER_NAME_${u}"\n`;
                            o += `echo "$USER_NAME_${u}:$USER_PASS_${u}" | chpasswd\n`;
                        } else {
                            o += `read -p "Enter Username ${u}: " u${u}\n`;
                            o += `useradd -m -G wheel -s /bin/bash "$u${u}"\n`;
                            o += `read -s -p "Enter password for $u${u}: " upass\necho\n`;
                            o += `read -s -p "Confirm password for $u${u}: " upass2\necho\n`;
                            o += `if [ "$upass" = "$upass2" ]; then echo "$u${u}:$upass" | chpasswd; else echo "Passwords do not match!"; exit 1; fi\n`;
                        }
                    }
                }

            
            o += `echo -e "\\n\\e[38;2;247;118;142m>> Interactive Configuration\\e[0m"\n`;
            
            if (configMode === 'interactive') {
                o += `read -p "Install JetBrains Mono & Terminal Themes? (y/N): " setup_themes\n`;
                o += `if [[ "$setup_themes" =~ ^[Yy]$ ]]; then\n`;
                o += `  ${inst(['ttf-jetbrains-mono', 'ttf-jetbrains-mono-nerd'])}\n`;
                o += `  echo "Available Themes: 1) Tokyo Night  2) Dracula  3) Gruvbox  4) Nordic"\n`;
                o += `  read -p "Select Theme (1-4): " theme_sel\n`;
                o += `  case "$theme_sel" in\n`;
                o += `    1) THEME="tokyonight" ;;\n`;
                o += `    2) THEME="dracula" ;;\n`;
                o += `    3) THEME="gruvbox" ;;\n`;
                o += `    4) THEME="nordic" ;;\n`;
                o += `    *) THEME="tokyonight" ;;\n`;
                o += `  esac\n`;
                o += `  echo "Theme $THEME selected (Configuration will be applied via dotfiles / user bashrc)"\n`;
                o += `fi\n`;
            } else {
                o += `\n# Install JetBrains Mono & Theme (Pre-configured)\n`;
                o += `${inst(['ttf-jetbrains-mono', 'ttf-jetbrains-mono-nerd'])}\n`;
                o += `THEME="${advThemeMode}"\n`;
                o += `echo "Theme $THEME selected (Configuration will be applied via dotfiles / user bashrc)"\n`;
            }

        } else {
            o += `${M.chroot}\n`;
        }

        if (software_type === "libre") o += `echo "permit persist :wheel" > /etc/doas.conf\nln -s /usr/bin/doas /usr/bin/sudo\n`;
        else o += `echo "%wheel ALL=(ALL:ALL) ALL" > /etc/sudoers.d/wheel\n`;

        if (!cmdOnly) o += `\`\`\`\n\n## 3. Initramfs\n\`\`\`bash\n`;
        else o += `\n# 3. Initramfs\n`;

        /* `M.initramfs === null` is an answer, not a gap: the system has no
           such command and the step has to be written out instead. On Gentoo
           the initramfs comes from dracut, pulled in by installkernel's USE
           flag, and it is rebuilt whenever a kernel is installed — so there is
           nothing to run by hand, and what does need saying is which modules to
           name when the root volume is encrypted. */
        if (M.initramfs === null && isGentoo) {
            o += `# Gentoo has no mkinitcpio. The initramfs comes from dracut, pulled in\n`;
            o += `# through sys-kernel/installkernel with its dracut USE flag, and it is\n`;
            o += `# rebuilt automatically whenever a kernel is installed.\n`;
            M.dracut.enable.forEach(c => { o += `${c}\n`; });
            if (part !== "unencrypted") {
                o += `mkdir -p /etc/dracut.conf.d\n`;
                o += `cat > /etc/dracut.conf.d/luks.conf << 'DRACUT'\n`;
                o += `${M.dracut.cryptModules}\n`;
                o += `DRACUT\n`;
                o += `# Dracut usually detects an encrypted root on its own, but only if it\n`;
                o += `# can see the running configuration while it builds. Naming the\n`;
                o += `# modules makes it independent of that; the failure it prevents is an\n`;
                o += `# initramfs that cannot open the root volume, which you find out\n`;
                o += `# about at the first reboot and not before.\n`;
            }
        } else if (isImaged) {
            /* No mkinitcpio and nothing to rebuild. The image ships an
               initramfs the board already boots, and full-disk encryption -
               the only reason this section adds hooks - is not something this
               system does. The guide says that at length in its own section
               rather than quietly emitting Arch's tool for it here. */
            o += `# The image ships its own initramfs and the board already boots it.\n`;
            o += `# There is no mkinitcpio here, and no encrypted volume for a hook to\n`;
            o += `# unlock: ${osLabel} does not offer full-disk encryption at install\n`;
            o += `# time. Adding it afterwards is ${M.fde.mechanism}, and it is a rebuild\n`;
            o += `# of the system rather than a setting. Docs: ${M.authority}\n`;
            if (M.initramfs) {
                o += `# If you do change what the initramfs holds, this rebuilds it:\n`;
                o += `#   ${M.initramfs}\n`;
            }
        } else {
            let baseHooks = initSys === "systemd" ? "base systemd autodetect microcode modconf kms keyboard sd-vconsole block" : "base udev autodetect microcode modconf kms keyboard keymap consolefont block";
            let cryptoHook = part !== "unencrypted" ? (initSys === "systemd" ? "sd-encrypt" : "encrypt") : "";
            let lvmHook = part.includes("lvm") ? "lvm2" : "";
            let fsHook = fs === "btrfs" ? "btrfs filesystems fsck" : "filesystems fsck";
            /* The duress hook has to run before the volume is unlocked, so it
               goes immediately ahead of encrypt/sd-encrypt rather than being
               appended by a second sed afterwards. */
            let duressHook = (part !== "unencrypted" && luks_duress !== "none") ? "duress" : "";
            let hooks = [baseHooks, duressHook, cryptoHook, lvmHook, fsHook].filter(h => h).join(" ");
            if (duressHook) o += buildDuressHook(luks_duress, luks_duress_decoy, partRoot);
            o += `sed -i 's/^HOOKS=.*/HOOKS=(${hooks})/' /etc/mkinitcpio.conf\n${M.initramfs}\n`;
        }
        /* Gentoo reaches the same place through dracut, and its module has to
           exist before the initramfs is built. */
        if (M.initramfs === null && isGentoo && part !== "unencrypted" && luks_duress !== "none") {
            o += buildDuressHook(luks_duress, luks_duress_decoy, partRoot);
            o += `dracut --force\n`;
        }

        if (!cmdOnly) o += `\`\`\`\n\n## 4. Bootloader (${boot})\n\`\`\`bash\n`;
        else o += `\n# 4. Bootloader\n`;

        /* When the existing system keeps the menu, this guide installs no
           bootloader at all — it writes the kernel and initramfs and stops. A
           second bootloader that does not know about the first is the usual way
           the other operating system disappears from the menu, and the reader
           then has a machine that boots one system with no obvious way back.

           The steps that follow are the other system's, so they are comments:
           they run over there, after this install, not here. */
        if (isDual && dualOwner === 'existing') {
            o += `# NO BOOTLOADER IS INSTALLED HERE. You chose to let the existing\n`;
            o += `# ${dualboot} bootloader keep the menu, so this system only supplies a\n`;
            o += `# kernel and an initramfs for it to find.\n`;
            o += `#\n`;
            o += `# After this install finishes, boot ${dualboot} and run its own:\n`;
            o += `#   sudo grub-mkconfig -o /boot/grub/grub.cfg      # GRUB\n`;
            o += `#   sudo update-grub                               # Debian/Ubuntu wrapper\n`;
            o += `#   sudo bootctl list                              # systemd-boot: check entries\n`;
            o += `#\n`;
            o += `# os-prober must be installed AND enabled over there, or it will not see\n`;
            o += `# this system: since GRUB 2.06 it is off by default.\n`;
            o += `#   echo GRUB_DISABLE_OS_PROBER=false | sudo tee -a /etc/default/grub\n`;
            if (!espShared) {
                o += `#\n`;
                o += `# This system has its own EFI partition, so the other bootloader will\n`;
                o += `# not find it by scanning its own ESP. Mount this one where that\n`;
                o += `# system can read it before running os-prober, or add the entry by\n`;
                o += `# hand with efibootmgr.\n`;
            }
            if (part !== "unencrypted") {
                o += `#\n`;
                o += `# The root volume is encrypted, and os-prober does not look inside a\n`;
                o += `# locked volume. Expect to write the menu entry by hand, with the\n`;
                o += `# cryptdevice UUID this install prints below.\n`;
                o += `LUKS_UUID=$(blkid -s UUID -o value ${partRoot})\n`;
                o += `echo "Give the other system's bootloader this: cryptdevice=UUID=$LUKS_UUID:cryptroot"\n`;
            }
        } else {

            if (fw === "bios" || boot.includes("grub")) {
                /* GRUB_PLATFORMS has to be set before GRUB is built on Gentoo, not
                   after: the package compiles for whichever platform is configured
                   at merge time, and grub-install then refuses with an error that
                   does not obviously point back here. */
                if (isGentoo) {
                    o += `echo 'GRUB_PLATFORMS="${fw === "uefi" ? 'efi-64' : 'pc'}"' >> /etc/portage/make.conf\n`;
                    o += `${inst(['grub'])}\n`;
                    if (fw === "uefi") o += `${inst(['efibootmgr'])}\n`;
                } else {
                    o += `pacman -S --noconfirm grub efibootmgr\n`;
                }
                o += fw === "uefi"
                    ? (isGentoo
                        ? `grub-install --efi-directory=${M.espMount}\n`
                        : `grub-install --target=x86_64-efi --efi-directory=/efi --bootloader-id=GRUB\n`)
                    : `grub-install --target=i386-pc ${disk}\n`;
                if (part !== "unencrypted") {
                    o += `LUKS_UUID=$(blkid -s UUID -o value ${partRoot})\n`;
                    o += `sed -i "s|^GRUB_CMDLINE_LINUX=.*|GRUB_CMDLINE_LINUX=\\"cryptdevice=UUID=$LUKS_UUID:cryptroot root=/dev/mapper/cryptroot\\"|" /etc/default/grub\n`;
                    o += `echo "GRUB_ENABLE_CRYPTODISK=y" >> /etc/default/grub\n`;
                }
                /* os-prober is what puts the other system in this menu, and GRUB
                   has shipped with it disabled since 2.06 — so without this line
                   the menu is built, looks right, and has one entry. */
                if (isDual) {
                    o += `${inst(['os-prober'])}\n`;
                    o += `echo "GRUB_DISABLE_OS_PROBER=false" >> /etc/default/grub\n`;
                    o += `# Off by default since GRUB 2.06. Without this the other system never\n`;
                    o += `# appears in the menu, however well it is installed.\n`;
                    if (dualDefault === 'other') {
                        /* Naming a menu index would break the moment a kernel is
                           added. `saved` plus grub-set-default follows the entry
                           rather than its position. */
                        o += `echo "GRUB_DEFAULT=saved" >> /etc/default/grub\n`;
                        o += `echo "GRUB_SAVEDEFAULT=true" >> /etc/default/grub\n`;
                        o += `# Boots whatever was chosen last, so selecting ${dualboot} once makes\n`;
                        o += `# it the default. A fixed menu index would move the next time a\n`;
                        o += `# kernel is added.\n`;
                    }
                }
                o += `grub-mkconfig -o /boot/grub/grub.cfg\n`;
                if (isDual) {
                    o += `grep -c menuentry /boot/grub/grub.cfg\n`;
                    o += `# Expect more than one. If this says 1, os-prober did not find the\n`;
                    o += `# other system — check it is not hibernated and, if its root is\n`;
                    o += `# encrypted, that it is unlocked while grub-mkconfig runs.\n`;
                }
            } else if (boot.includes("uki")) {
                if (cmdOnly) o += `echo -e "\n\${COLOR_BLUE}:: Step 4: Unified Kernel Image (UKI)\${COLOR_RESET}\n\${COLOR_FG}A UKI bundles the kernel, initramfs, and cmdline into a single EFI file. Extremely secure, built for Secure Boot.\nWiki: https://wiki.archlinux.org/title/Unified_kernel_image\${COLOR_RESET}"\n`;
                if (isGentoo) {
                    o += `${inst(['sbsigntools', 'efitools', 'efibootmgr'])}\n`;
                    /* Gentoo builds a unified image through dracut rather than a
                       mkinitcpio preset. `uefi="yes"` is what makes it one bundled
                       executable instead of a kernel and an initramfs. */
                    o += `mkdir -p /etc/dracut.conf.d\n`;
                    o += `echo 'uefi="yes"' >> /etc/dracut.conf.d/uki.conf\n`;
                    if (gentooKernel === 'manual') {
                        o += `# A hand-built kernel gets its unified image from installkernel on the\n`;
                        o += `# next 'make install'; there is no package to reconfigure.\n`;
                    } else {
                        o += `emerge --config ${(M.kernelPkgs[gentooKernel] || M.kernelPkgs.bin)[0]}   # rebuilds the image\n`;
                    }
                } else {
                    o += `pacman -S --noconfirm sbsigntools efitools efibootmgr\n`;
                }
                if (boot === "uki-shim") {
                    if (isGentoo) {
                        /* shim is distributed as a signed binary by its vendor, so
                           there is no ebuild to point at. Saying where it comes from
                           beats emitting a package name that does not resolve. */
                        o += `# shim-signed has no Gentoo package: it is a vendor-signed binary.\n`;
                        o += `# Take shimx64.efi from a distribution that ships it, or build and\n`;
                        o += `# sign your own, then:\n`;
                        o += `#   cp shimx64.efi ${M.espMount}/EFI/gentoo/bootx64.efi\n`;
                    } else {
                        o += `pacman -S --noconfirm shim-signed\ncp /usr/share/shim-signed/shimx64.efi /efi/EFI/arch/bootx64.efi\n`;
                    }
                }
            } else if (boot === "systemd-boot") {
                if (cmdOnly) o += `echo -e "\n\${COLOR_BLUE}:: Step 4: Installing systemd-boot\${COLOR_RESET}\n\${COLOR_FG}systemd-boot is a minimalist, fast bootloader for UEFI systems.\nWiki: https://wiki.archlinux.org/title/Systemd-boot\${COLOR_RESET}"\n`;
                o += `bootctl install --esp-path=/efi\n`;
                /* systemd-boot has no os-prober. It lists what is in the ESP, so
                   another system appears only if its loader is there — which is
                   exactly what a separate ESP prevents. Saying so beats a menu that
                   silently has one entry. */
                if (isDual) {
                    o += `bootctl list\n`;
                    if (espShared) {
                        o += `# systemd-boot lists loaders it finds in the ESP. Windows appears\n`;
                        o += `# automatically; another Linux does only if its loader is on this\n`;
                        o += `# same partition. There is no os-prober here.\n`;
                    } else {
                        o += `# This system has its OWN EFI partition, and systemd-boot only lists\n`;
                        o += `# what is on the one it was installed to. The other system will not\n`;
                        o += `# appear in this menu: reach it through the firmware boot menu, or\n`;
                        o += `# add an entry with efibootmgr.\n`;
                    }
                    if (dualDefault === 'other') {
                        o += `# You asked for the other system to boot by default. systemd-boot\n`;
                        o += `# takes the entry id from 'bootctl list' above:\n`;
                        o += `#   sed -i 's/^default .*/default <that-entry-id>/' /efi/loader/loader.conf\n`;
                    }
                }
            }
        }

        if (!cmdOnly) o += `\`\`\`\n\n## 5. DNS (${dns})\n\`\`\`bash\n`;
        else o += `\n# 5. DNS\n`;

        /* The daemon is a package and a service, both of which differ by system
           and by init. systemd-resolved is the exception: it is part of systemd,
           so on an OpenRC machine there is nothing to enable and the fallback
           has to be a resolver that exists there. */
        if (dns === "unbound") o += `${inst(['unbound'])}\n${svc('unbound')}\n`;
        else if (dns === "dnscrypt-proxy") o += `${inst(['dnscrypt-proxy'])}\n${svc('dnscrypt-proxy')}\n`;
        else if (dns === "bind") o += `${inst(['bind'])}\n${svc('named')}\n`;
        else if (dns === "dnsmasq") o += `${inst(['dnsmasq'])}\n${svc('dnsmasq')}\n`;
        else if (openrc) {
            o += `# systemd-resolved is part of systemd and does not exist here. Stubby\n`;
            o += `# is the OpenRC equivalent: a local stub resolver that forwards over\n`;
            o += `# TLS. It is configured below.\n`;
            o += `${inst(['stubby'])}\n${svc('stubby')}\n`;
        }
        else o += `systemctl enable systemd-resolved\n`;

        /* Encrypted DNS. This whole block did not exist: the generator picked a
           resolver *daemon* and nothing else, so every guide it produced left
           DNS in plaintext to whatever DHCP handed out — visible to the ISP and
           to anyone on the path, whatever HTTPS does afterwards.

           Built by the shared dns-providers.js so this and the walkthrough emit
           byte-identical config. The important part is `address#hostname`:
           `DNSOverTLS=yes` alone encrypts without authenticating, and anyone
           able to answer on port 853 is then trusted. */
        const dnsProviderId = gv('dns_provider', '');
        const dnsProv = (window.DnsProviders && window.DnsProviders.table[dnsProviderId]) || null;
        if (dnsProv) {
            const dnsMode = gv('dns_ipv4_only', 'no') === 'yes' ? 'ipv4' : 'both';
            o += `\n# Encrypted DNS — ${dnsProv.label}, DNS-over-TLS with the\n`;
            o += `# certificate name pinned, plus DNSSEC.\n`;
            /* Two resolvers both wanting port 53 is a conflict the reader will
               otherwise meet as "DNS stopped working after a reboot", with
               nothing on screen connecting it to two answers given minutes
               apart. Named here rather than left to be discovered. */
            if (dns !== 'systemd-resolved') {
                o += `# NOTE: you also chose ${dns} as the resolver daemon. Both it and the\n`;
                o += `# stub configured here want port 53 — run one, or point ${dns} at the\n`;
                o += `# stub as its upstream. Two listeners on 53 is a conflict that shows\n`;
                o += `# up as DNS failing after the next reboot.\n`;
            }
            /* Writing a resolved drop-in on a machine with no resolved is
               encrypted DNS that is configured, looks configured and never runs
               — the defect class this repository exists to remove. Stubby is
               the daemon that does the same job under OpenRC, and tls_auth_name
               is its spelling of the certificate pin. */
            if (openrc) {
                /* Stubby is what carries the encryption here, so it has to be
                   present whichever resolver daemon was chosen above. When the
                   answer was systemd-resolved it was already installed there;
                   when it was unbound or dnsmasq it was not, and writing a
                   config for a daemon that is not installed is the same
                   never-runs failure this branch exists to avoid. */
                if (dns !== 'systemd-resolved') {
                    o += `${instNeeded(['stubby'])}\n${svc('stubby')}\n`;
                }
                o += `mkdir -p /etc/stubby\n`;
                o += `cat > /etc/stubby/stubby.yml << 'DNSCONF'\n`;
                window.DnsProviders.buildStubbyConf(dnsProv, dnsMode)
                    .forEach(line => { o += `${line}\n`; });
                o += `DNSCONF\n`;
                /* Already enabled where the resolver daemon was chosen; a
                   second rc-update for the same script is noise in a guide
                   people read line by line. */
                o += `printf 'nameserver 127.0.0.1\\noptions edns0\\n' > /etc/resolv.conf\n`;
                o += `chattr +i /etc/resolv.conf   # stop DHCP replacing it\n`;
            } else {
                o += `mkdir -p /etc/systemd/resolved.conf.d\n`;
                o += `cat > /etc/systemd/resolved.conf.d/dns.conf << 'DNSCONF'\n`;
                window.DnsProviders.buildResolvedConf(dnsProv, dnsMode)
                    .forEach(line => { o += `${line}\n`; });
                o += `DNSCONF\n`;
                o += `systemctl enable systemd-resolved\n`;
                o += `ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf\n`;
            }
            if (dnsMode === 'ipv4') {
                o += `# IPv4 only: a v6 resolver on a network without working v6 does not\n`;
                o += `# fail cleanly — lookups go intermittent, which reads as broken DNS.\n`;
            }
            // NetworkManager will happily replace resolv.conf with whatever DHCP
            // said, silently undoing all of the above on the next connect.
            if (post_apps.includes('networkmanager')) {
                o += `\n# NetworkManager overwrites resolv.conf from DHCP otherwise, which\n`;
                o += `# silently undoes the above on the next connection.\n`;
                o += `mkdir -p /etc/NetworkManager/conf.d\n`;
                if (openrc) {
                    o += `printf '[main]\\ndns=none\\n' > /etc/NetworkManager/conf.d/dns.conf\n`;
                    o += `# dns=none rather than systemd-resolved, which is not running here:\n`;
                    o += `# it leaves the resolv.conf written above alone.\n`;
                } else {
                    o += `printf '[main]\\ndns=systemd-resolved\\n' > /etc/NetworkManager/conf.d/dns.conf\n`;
                }
            }
            if (openrc) {
                o += `echo "Verify after boot: stubby -i should parse the config, and"\n`;
                o += `echo "dig @127.0.0.1 example.com should answer through ${dnsProv.tls}"\n`;
            } else {
                o += `echo "Verify after boot: resolvectl status should show DNSOverTLS: yes"\n`;
                o += `echo "and each server as <address>#${dnsProv.tls}"\n`;
            }
        }

        if (!cmdOnly) o += `\`\`\`\n\n## 6. Desktop & Apps\n\`\`\`bash\n`;
        else o += `\n# 6. Desktop & Apps\n`;
        
        o += `\n### POST-INSTALL BOUNDARY ###\n`;

        /* The AUR is Arch's, and `M.aur` is what says so. A system without one
           gets no build user, no helper and no clone — and the packages the AUR
           would have supplied are looked up in that system's own repositories
           below, or named as unavailable there. */
        const needsAUR = post_apps.length > 0 || desktop === "dusky";
        if (needsAUR && M.aur) {
            o += `pacman -S --noconfirm git base-devel\nuseradd -m -G wheel -s /bin/bash builder\necho "builder ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers.d/builder\n`;
            o += `su - builder -c "git clone https://aur.archlinux.org/paru.git /tmp/paru && cd /tmp/paru && makepkg -si --noconfirm"\n`;
        }

        /* Apps, as lists of Arch package names. Lists rather than strings so
           each name can be translated for the target system; joined back with a
           space, Arch's command is the string it always was. */
        /* Applications and their packages come from the catalogue in
           os-install.js, which the walkthrough reads too.

           They used to be two tables in two files. The generator offered 34
           applications and the walkthrough 13, the same tick meant different
           packages on the two sides, and an application missing from this
           table was skipped in silence - a checkbox that installed nothing and
           reported nothing, which is this project's oldest defect wearing a
           different hat. `tests/app-parity.mjs` now fails if the two lists
           diverge again. */
        const CATALOGUE = window.APPS || [];
        const aurApps = CATALOGUE.filter(a => a.aur).map(a => a.id);
        const pacApps = {};
        CATALOGUE.forEach(a => { if (!a.aur) pacApps[a.id] = a.pkgs; });

        /* The AUR name each of these has, where it differs from the option id.
           Also the name looked up in another system's repositories. */
        const aurPkgName = { 'ungoogled-chromium': 'ungoogled-chromium-bin' };
        let overlaysNeeded = [];
        post_apps.forEach(app => {
            if (app === 'paru') return; // already installed
            if (aurApps.includes(app)) {
                if (M.aur) {
                    let pkg = aurPkgName[app] || app;
                    o += `su - builder -c "paru -S --noconfirm ${pkg}"\n`;
                    return;
                }
                /* No AUR here. Three outcomes, and the guide has to distinguish
                   them: the package is in this system's own repositories, it is
                   in an overlay that has to be enabled first, or it is not
                   packaged at all. Emitting an install command for the last two
                   produces a script that stops with an error a reader has no way
                   to interpret. */
                const over = window.osPkgOverlay ? window.osPkgOverlay(modelKey, app) : null;
                if (over) {
                    overlaysNeeded.push(over);
                    o += `emerge --verbose ${over.atom}\n`;
                    return;
                }
                const mapped = pkgOf(app === 'signal' ? 'signal-desktop' : app);
                if (mapped) o += `${inst([app === 'signal' ? 'signal-desktop' : app])}\n`;
                else o += `# ${app}: no ${osLabel} package and no overlay carrying it.\n`;
                return;
            }
            if (!pacApps[app]) {
                /* Not in the catalogue. Previously this returned silently and
                   the tick did nothing at all; saying so in the script is the
                   difference between a bug the reader can see and one they
                   cannot. app-parity makes it unreachable, and it stays here
                   because an unreachable branch that fails loudly costs
                   nothing and an absent one costs a silent install. */
                o += `# '${app}' is selected but is not in the application catalogue,
`;
                o += `# so nothing was emitted for it. Please report this.
`;
                return;
            }
            const mapped = pkgsOf(pacApps[app]);
            if (mapped.length) o += `${inst(pacApps[app])}\n`;
            const gone = window.osPkgUnavailable ? window.osPkgUnavailable(modelKey, pacApps[app]) : [];
            if (gone.length) {
                o += `# Not a separate package on ${osLabel}: ${gone.join(', ')}.\n`;
            }
        });
        /* One block, before the packages that need it, rather than repeated per
           app: adding the same overlay twice is an error, not a no-op. */
        if (overlaysNeeded.length) {
            const seen = [];
            const pre = [];
            overlaysNeeded.forEach(v => {
                if (seen.indexOf(v.repo) !== -1) return;
                seen.push(v.repo);
                pre.push(`# ${v.repo} is ${v.note}, not part of the main tree.\n`);
                pre.push(`emerge --verbose --noreplace app-eselect/eselect-repository\n`);
                pre.push(`eselect repository enable ${v.repo}\n`);
                pre.push(`emerge --sync ${v.repo}\n`);
            });
            /* Inserted ahead of the emerge lines that depend on it. */
            const at = o.lastIndexOf('### POST-INSTALL BOUNDARY ###\n');
            const cut = at + '### POST-INSTALL BOUNDARY ###\n'.length;
            o = o.slice(0, cut) + pre.join('') + o.slice(cut);
        }
        // Packages the user typed in themselves. Checked on the machine, where
        // the real package database is, and warned about rather than aborted:
        // a name this browser could not verify may be perfectly valid, and a
        // rename upstream should stop the user, not kill the script.
        const extraPkgs = gv('extra_packages', '').trim().split(/\s+/)
            // Filtered to the characters Arch package names actually allow, so
            // nothing a user pastes can break out of the loop below.
            .filter(p => p && /^[a-z0-9@._+-]+$/i.test(p));
        if (extraPkgs.length) {
            o += `\n# Your own packages. Verified here, not in the browser.\n`;
            o += `for pkg in ${extraPkgs.join(' ')}; do\n`;
            if (isGentoo) {
                /* --pretend resolves the atom without merging anything, so an
                   unknown name is caught before the build starts rather than
                   after it has spent an hour on a dependency. */
                o += `    if emerge --pretend --quiet "$pkg" >/dev/null 2>&1; then\n`;
                o += `        ${M.install(['"$pkg"'])}\n`;
                o += `    else\n`;
                o += `        echo "WARNING: '$pkg' is not in the Portage tree." >&2\n`;
                o += `        echo "  Search:  https://packages.gentoo.org/packages/search?q=$pkg" >&2\n`;
                o += `        echo "  It may live in an overlay, or be named differently here." >&2\n`;
                o += `    fi\n`;
            } else {
                o += `    if pacman -Si "$pkg" >/dev/null 2>&1; then\n`;
                o += `        pacman -S --needed --noconfirm "$pkg"\n`;
                o += `    elif su - builder -c "paru -Si '$pkg'" >/dev/null 2>&1; then\n`;
                o += `        su - builder -c "paru -S --needed --noconfirm '$pkg'"\n`;
                o += `    else\n`;
                o += `        echo "WARNING: '$pkg' is in neither the official repos nor the AUR." >&2\n`;
                o += `        echo "  Official: https://archlinux.org/packages/?q=$pkg" >&2\n`;
                o += `        echo "  AUR:      https://aur.archlinux.org/packages?K=$pkg" >&2\n`;
                o += `        echo "  It may have been renamed or dropped. Skipping this one." >&2\n`;
                o += `    fi\n`;
            }
            o += `done\n`;
        }

        // Post-install service enables & extra setup
        if (post_apps.includes('flatpak')) o += `flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo\n`;
        if (post_apps.includes('zsh')) o += `chsh -s /bin/zsh\n`;
        if (post_apps.includes('networkmanager')) o += `${svcNow('NetworkManager')}\n`;
        if (post_apps.includes('bluetooth')) o += `${svcNow('bluetooth')}\n`;
        if (post_apps.includes('pipewire')) {
            /* A per-user service under systemd; under OpenRC there is no user
               session manager, so it is started from the desktop session
               instead and there is nothing to enable at the system level. */
            if (openrc) {
                o += `# PipeWire runs per user. OpenRC has no user session manager, so start\n`;
                o += `# it from your desktop session — most compositors do this already, and\n`;
                o += `# elogind provides the seat it needs.\n`;
            } else {
                o += `systemctl --user enable --now pipewire pipewire-pulse wireplumber\n`;
            }
        }
        if (post_apps.includes('clamav')) o += `freshclam\n${svcNow('clamav-freshclam')}\n`;
        
        if (post_apps.includes('doas')) {
            o += `\n# Configure Doas\n`;
            o += `echo "permit persist :wheel" > /etc/doas.conf\n`;
            o += `chown -c root:root /etc/doas.conf\n`;
            o += `chmod -c 0400 /etc/doas.conf\n`;
            
            if (configMode === 'interactive') {
                o += `\n# Interactive Doas Wrapper Prompt\n`;
                o += `doas_prompt() {\n`;
                o += `  exec < /dev/tty\n`;
                o += `  echo -e "\\n\\e[38;2;122;162;247m======================================\\e[0m"\n`;
                o += `  echo "Doas Configuration"\n`;
                o += `  echo -e "\\e[38;2;122;162;247m======================================\\e[0m"\n`;
                o += `  read -p "Do you want to fully replace Sudo with a Doas Wrapper? (y/n): " ans\n`;
                o += `  if [[ "$ans" =~ ^[Yy]$ ]]; then\n`;
                o += `    echo "Fully replacing sudo..."\n`;
                o += `    ${M.removeNoDeps(['sudo'])} || true\n`;
                o += `    cat << 'EOF' > /usr/local/bin/sudo\n#!/bin/bash\n# Doas Wrapper script\nargs=()\nfor arg in "$@"; do\n  if [[ "$arg" == "-E" ]]; then continue; fi\n  if [[ "$arg" == "-i" ]]; then args+=("-s"); continue; fi\n  if [[ "$arg" == "-v" ]]; then doas -C /etc/doas.conf; exit $?; fi\n  args+=("$arg")\ndone\nexec /usr/bin/doas "\${args[@]}"\nEOF\n`;
                o += `    chmod +x /usr/local/bin/sudo\n`;
                o += `    ln -sf /usr/local/bin/sudo /usr/bin/sudo\n`;
                o += `  else\n`;
                o += `    echo "Keeping standard sudo alongside doas."\n`;
                o += `  fi\n`;
                o += `}\n`;
                o += `doas_prompt\n`;
            } else {
                if (advDoasMode === 'replace') {
                    o += `\n# Fully Replace Sudo with Doas Wrapper (Pre-configured)\n`;
                    o += `${M.removeNoDeps(['sudo'])} || true\n`;
                    o += `cat << 'EOF' > /usr/local/bin/sudo\n#!/bin/bash\n# Doas Wrapper script\nargs=()\nfor arg in "$@"; do\n  if [[ "$arg" == "-E" ]]; then continue; fi\n  if [[ "$arg" == "-i" ]]; then args+=("-s"); continue; fi\n  if [[ "$arg" == "-v" ]]; then doas -C /etc/doas.conf; exit $?; fi\n  args+=("$arg")\ndone\nexec /usr/bin/doas "\${args[@]}"\nEOF\n`;
                    o += `chmod +x /usr/local/bin/sudo\n`;
                    o += `ln -sf /usr/local/bin/sudo /usr/bin/sudo\n`;
                } else if (advDoasMode === 'remove') {
                    o += `\n# Remove Sudo entirely (Pre-configured)\n`;
                    o += `${M.removeNoDeps(['sudo'])} || true\n`;
                }
            }
        }

        // Desktop environments.
        // Dusky is Hyprland on Wayland — it is a dotfiles project, not a
        // separate OS, and Hyprland has no Xorg backend at all. It used to be
        // grouped with dwm here, so choosing Dusky on "Auto" emitted an Xorg
        // install for a compositor that cannot use one. dwm is the Xorg case.
        const dsXorg = (displayServer === "auto" && desktop === "dwm") || displayServer === "xorg";
        if (desktop === "gnome") { o += `${inst(['gnome', 'gnome-tweaks', dsXorg ? 'xorg-server' : 'wayland'])}\n${svc('gdm')}\n`; }
        else if (desktop === "kde") { o += `${inst(['plasma-desktop', 'sddm', dsXorg ? 'xorg-server' : 'wayland'])}\n${svc('sddm')}\n`; }
        else if (desktop === "dwm") { o += `${inst(['xorg-server', 'xorg-xinit', 'base-devel', 'libx11', 'libxinerama', 'libxft'])}\ngit clone https://git.suckless.org/dwm /usr/local/src/dwm && cd /usr/local/src/dwm && make install\n`; }
        else if (desktop === "dusky") {
            // Not conditional on dsXorg: Dusky's own install.sh pulls Hyprland,
            // Waybar, Rofi, Swaync, Wlogout and SDDM. All that is needed first
            // is a Wayland base plus Xwayland for legacy X clients.
            o += `${inst(['git', 'base-devel', 'wayland', 'xorg-xwayland'])}\n`;
            /* Dusky's installer is written against Arch and calls pacman and an
               AUR helper directly. On a source-based system it has to be built
               through that system's own package manager instead — keyed on
               whether the system compiles rather than on its name, because that
               is the property that decides it. */
            if (M.kernel && M.kernel.compiled) {
                o += `# Dusky's own install.sh is written against Arch: it calls pacman and\n`;
                o += `# an AUR helper, neither of which exists here. Build its components\n`;
                o += `# through Portage, then take the dotfiles from the repository.\n`;
                o += `${inst(['hyprland', 'waybar', 'rofi', 'sddm'])}\n`;
                o += `${svc('sddm')}\n`;
                o += `# swaync and wlogout are not in the main tree. Enable GURU for them:\n`;
                o += `#   emerge --verbose --noreplace app-eselect/eselect-repository\n`;
                o += `#   eselect repository enable guru && emerge --sync guru\n`;
                o += `git clone https://github.com/dusklinux/dusky.git /tmp/dusky\n`;
                o += `# Copy the configuration from /tmp/dusky/config into ~/.config by hand;\n`;
                o += `# do not run its install.sh, which would call pacman.\n`;
            } else {
                o += software_type === "libre"
                    ? `su - builder -c "git clone https://github.com/dusklinux/dusky.git /tmp/dusky && cd /tmp/dusky && sed -i 's/sudo/doas/g' install.sh && ./install.sh"\n`
                    : `su - builder -c "git clone https://github.com/dusklinux/dusky.git /tmp/dusky && cd /tmp/dusky && ./install.sh"\n`;
            }
        }

        // Browser (from browser dropdown, separate from post_apps)
        if (browser === "librewolf") {
            if (M.aur) o += `su - builder -c "paru -S --noconfirm librewolf"\n`;
            else {
                const lw = window.osPkgOverlay ? window.osPkgOverlay(modelKey, 'librewolf') : null;
                if (lw) {
                    o += `# ${lw.repo} is ${lw.note}, not part of the main tree.\n`;
                    o += `emerge --verbose --noreplace app-eselect/eselect-repository\n`;
                    o += `eselect repository enable ${lw.repo}\n`;
                    o += `emerge --sync ${lw.repo}\n`;
                    o += `emerge --verbose ${lw.atom}\n`;
                } else {
                    o += `# librewolf: no ${osLabel} package and no overlay carrying it.\n`;
                }
            }
        }
        else if (browser === "firefox") o += `${inst(['firefox'])}\n`;



        // Hardened OpenSSH setup
        if (post_apps.includes('openssh')) {
            if (!cmdOnly) o += `\`\`\`\n\n### OpenSSH Server Setup (Hardened)\n\`\`\`bash\n`;
            else o += `\n# OpenSSH — Hardened Setup\n`;
            o += `# Generate Ed25519 host keys\n`;
            o += `ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""\n`;
            o += `rm -f /etc/ssh/ssh_host_rsa_key /etc/ssh/ssh_host_dsa_key /etc/ssh/ssh_host_ecdsa_key\n`;
            o += `# Harden sshd_config\n`;
            o += `cat > /etc/ssh/sshd_config << 'SSHD'\n`;
            o += `Port 22\nAddressFamily inet\nListenAddress 0.0.0.0\n`;
            o += `HostKey /etc/ssh/ssh_host_ed25519_key\nKexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org\n`;
            o += `Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com\nMACs hmac-sha2-512-etm@openssh.com\n`;
            o += `PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n`;
            o += `AuthenticationMethods publickey\nPubkeyAuthentication yes\n`;
            o += `X11Forwarding no\nAllowTcpForwarding no\nPermitTunnel no\nGatewayPorts no\n`;
            o += `MaxAuthTries 3\nLoginGraceTime 30\nClientAliveInterval 300\nClientAliveCountMax 2\n`;
            o += `AllowAgentForwarding no\nUsePAM yes\nPrintMotd no\n`;
            o += `SSHD\n`;
            o += `# Generate user SSH key pair (Ed25519)\n`;
            o += `USER_SSH_DIR="/home/$NEWUSER/.ssh"\n`;
            o += `mkdir -p "$USER_SSH_DIR" && chmod 700 "$USER_SSH_DIR"\n`;
            o += `ssh-keygen -t ed25519 -f "$USER_SSH_DIR/id_ed25519" -C "$NEWUSER@arch" -N ""\n`;
            o += `cat "$USER_SSH_DIR/id_ed25519.pub" >> "$USER_SSH_DIR/authorized_keys"\n`;
            o += `chmod 600 "$USER_SSH_DIR/authorized_keys"\nchown -R "$NEWUSER:$NEWUSER" "$USER_SSH_DIR"\n`;
            o += `${svc(openrc ? 'sshd' : 'sshd.service')}\n`;
            o += `echo "# SSH private key saved: $USER_SSH_DIR/id_ed25519"\n`;
            o += `echo "# Copy id_ed25519 to your client machine before rebooting!"\n`;
            if (!cmdOnly) o += `\`\`\`\n\n> ⚠️ **Save your SSH private key** (\`~/.ssh/id_ed25519\`) to your client machine before rebooting. Password auth is disabled.\n\n`;
        }

        // Snapper hooks
        if (post_apps.includes('snapper')) {
            o += `# Snapper BTRFS snapshot config\n`;
            o += `snapper -c root create-config /\n`;
            
            if (configMode === 'interactive') {
                o += `\n# Interactive Snapper Timeline Prompt\n`;
                o += `snapper_prompt() {\n`;
                o += `  exec < /dev/tty\n`;
                o += `  echo -e "\\n\\e[38;2;122;162;247m======================================\\e[0m"\n`;
                o += `  echo "Snapper Timeline Configuration"\n`;
                o += `  echo -e "\\e[38;2;122;162;247m======================================\\e[0m"\n`;
                o += `  read -p "Do you want to enable automatic hourly/daily timeline snapshots? (y/n): " ans\n`;
                o += `  if [[ "$ans" =~ ^[Yy]$ ]]; then\n`;
                o += `    echo "Enabling timeline snapshots..."\n`;
                o += `    ${snapperTimeline()}\n`;
                o += `  else\n`;
                o += `    echo "Timeline disabled. ${isGentoo ? 'Manual snapshots only.' : 'Pre/Post pacman snapshots only.'}"\n`;
                o += `  fi\n`;
                o += `}\n`;
                o += `snapper_prompt\n`;
            } else {
                if (advSnapperMode === 'timeline') {
                    o += `${snapperTimeline()}\n`;
                } else {
                    o += `# Timeline snapshots disabled by user selection.\n`;
                }
            }

            o += `# Install grub-btrfs for rollback menu\n`;
            o += `${svcNow(openrc ? 'grub-btrfsd' : 'grub-btrfsd.service')}\n`;
        } else if (fs === "btrfs") {
            o += `snapper -c root create-config /\n${snapperTimeline(false)}\n`;
        }

        // pfetch / fastfetch shell greeting
        if (post_apps.includes('fastfetch') || post_apps.includes('pfetch')) {
            const fetchCmd = post_apps.includes('fastfetch') ? 'fastfetch' : 'pfetch';
            o += `# Add system info greeting to shell\necho '${fetchCmd}' >> /etc/profile.d/greeting.sh\n`;
        }

        
        // Standalone Security Apps
        const secApps = [
            { id: 'libre-otp', name: 'Libre-OTP Authenticator', repo: 'libre-otp' },
            { id: 'anti-ducky', name: 'Anti-Ducky', repo: 'anti-ducky' },
            { id: 'anti-evil-maid', name: 'Anti-Evil Maid', repo: 'anti-evil-maid' },
            { id: 'kernel-watcher', name: 'Kernel Watcher (EDR)', repo: 'kernel-watcher' },
            { id: 'scarecrow', name: 'ScareCrow (LKM)', repo: 'scarecrow' },
            { id: 'kloak', name: 'Kloak (Keystroke Obfuscator)', repo: 'kloak' }
        ];

        secApps.forEach(app => {
            if (post_apps.includes(app.id)) {
                if (!cmdOnly) o += `\`\`\`\n\n### ${app.name} Setup\n\`\`\`bash\n`;
                else o += `\n# Setup ${app.name}\n`;
                o += `git clone https://github.com/tilas01/${app.repo}.git /opt/${app.repo}\n`;
                o += `cd /opt/${app.repo}\n`;
                if (app.id === 'kloak') {
                    o += `make\nsudo make install\n`;
                } else {
                    o += `cargo build --release\nsudo cp target/release/${app.repo} /usr/local/bin/\n`;
                }
                o += `cd -\n`;
                if (!cmdOnly) o += `\`\`\`\n\n`;
            }
        });

        // Dusky auto-setup. Driven by the desktop question, which is the
        // only place Dusky is chosen — it used to key off a post-install
        // checkbox that a separate yes/no control ticked on your behalf, so
        // the same decision existed in three places and could disagree.
        if (desktop === 'dusky') {
            if (!cmdOnly) o += `\n### Dusky Auto-Setup\n> Watch the [YouTube guide](https://www.youtube.com/watch?v=JmgvSdEIK8c) and read the [dusky repo](https://github.com/dusklinux/dusky) cheatsheet before running.\n\n\`\`\`bash\n`;
            else o += `\n# Dusky Auto-Setup (by dusklinux)\n# Watch: https://www.youtube.com/watch?v=JmgvSdEIK8c\n# Repo:  https://github.com/dusklinux/dusky\n`;
            if (M.aur) {
                o += `su - builder -c "git clone https://github.com/dusklinux/dusky.git /tmp/dusky && cd /tmp/dusky && ./install.sh"\n`;
            } else {
                /* install.sh calls pacman and an AUR helper directly. Running it
                   on a system with neither does not fail early and cleanly — it
                   gets partway through and leaves a half-configured desktop. */
                o += `git clone https://github.com/dusklinux/dusky.git /tmp/dusky\n`;
                o += `# Do not run install.sh here: it calls pacman and an AUR helper, and\n`;
                o += `# neither exists on ${osLabel}. The components were installed above;\n`;
                o += `# copy the configuration from /tmp/dusky into ~/.config yourself.\n`;
            }
            if (!cmdOnly) o += `\`\`\`\n\n> 📋 **Cheatsheet**: \`/tmp/dusky/cheatsheet.md\` — Hyprland keybinds and workflow\n`;
        }

        /* OpenRC init scripts have no `.service` suffix, so the unit name is
           written without one there. Passing the systemd spelling to
           `rc-update` produces a script name that does not exist and an enable
           that silently does nothing. */
        if (vm_guest === "vbox") o += `${svc(openrc ? 'virtualbox-guest-additions' : 'vboxservice.service')}\n`;
        else if (vm_guest === "vmware") o += `${svc(openrc ? 'vmtoolsd' : 'vmtoolsd.service')}\n`;
        else if (vm_guest === "qemu") o += `${svc(openrc ? 'qemu-guest-agent' : 'qemu-guest-agent.service')}\n`;
        if (needsAUR && M.aur) o += `userdel -r builder\nrm -f /etc/sudoers.d/builder\n`;

        // ── Security tool configuration (tilas01 Rust suite) ──
        // The binaries themselves are built above by the secApps loop, which
        // installs each crate to /usr/local/bin/<crate>. This block only
        // configures the ones the user actually selected.
        const SUITE_TOOLS = ['libre-otp', 'anti-ducky', 'anti-evil-maid',
                             'kernel-watcher', 'scarecrow', 'kloak',
                             'webhooks', 'panic-password'];
        // The all-in-one binary stands in for all five individual tools, so
        // configuration below treats it as if each one were selected.
        const wantsAllInOne = post_apps.includes('unix-security-suite');
        const effectiveSuite = wantsAllInOne
            ? Array.from(new Set([...post_apps, 'libre-otp', 'anti-ducky',
                                  'anti-evil-maid', 'kernel-watcher', 'scarecrow']))
            : post_apps;
        const selectedSuite = SUITE_TOOLS.filter(t => effectiveSuite.includes(t));

        if (selectedSuite.length > 0) {
            if (!cmdOnly) {
                o += `\`\`\`\n\n## 7. Security Suite Configuration (tilas01)\n\n`;
                o += `> **Shortcut:** instead of the per-tool steps below, the repository ships ` +
                     `a single installer that fetches all of these, verifies each hash and GPG ` +
                     `signature, installs them and writes hardened systemd units:\n>\n`;
                o += `> \`\`\`bash\n`;
                o += `> curl -fsSLO https://raw.githubusercontent.com/tilas01/Unix-SIT/main/scripts/install-security-suite.sh\n`;
                o += `> # read it before running it\n`;
                o += `> less install-security-suite.sh\n`;
                o += `> sudo bash install-security-suite.sh --only ${selectedSuite.join(',')}\n`;
                o += `> \`\`\`\n>\n`;
                o += `> It fails closed: anything that does not verify aborts the run. Daemons are ` +
                     `installed but left stopped so you can review them first.\n\n`;
                o += `The steps below are the equivalent done by hand.\n\n\`\`\`bash\n`;
            } else {
                o += `\n# 7. Security Suite Configuration\n`;
                o += `# Equivalent one-liner (verifies hashes and signatures, fails closed):\n`;
                o += `#   sudo bash install-security-suite.sh --only ${selectedSuite.join(',')}\n`;
            }
            o += `mkdir -p /etc/arch-security\n`;

            // Shared alert delivery. Installed whenever any suite tool is
            // selected, because a warning that only reaches a desktop
            // notification daemon is a warning you cannot rely on: notify-send
            // does nothing on a bare TTY, during early boot, or over SSH.
            o += `\n# ── Alert delivery (works on Wayland, Xorg and bare TTY) ──\n`;
            o += `curl --proto '=https' --tlsv1.2 -fsSLO \\\n`;
            o += `  https://raw.githubusercontent.com/tilas01/Unix-SIT/main/scripts/security-alert.sh\n`;
            o += `install -Dm755 security-alert.sh /usr/local/bin/security-alert\n`;
            o += `rm -f security-alert.sh\n`;
            o += `# Every tool below routes its warnings through this, so they reach\n`;
            o += `# desktop notifications, a blocking dialog, the console, every TTY,\n`;
            o += `# journald and an on-disk log — not just whichever one happens to work.\n`;

            if (effectiveSuite.includes('webhooks')) {
                o += `\n# Configuring alert webhooks\ncat << 'WH' > /etc/arch-security/webhook.conf\nPROVIDER=${webhook_provider}\nURL=${webhook_url}\nWH\n`;
                o += `chmod 600 /etc/arch-security/webhook.conf\n`;
            }

            if (effectiveSuite.includes('libre-otp')) {
                if (libreOtpMode === 'tamper-check') {
                    // Silent mode: one secret, never shown, compared internally at
                    // boot. Detects a modified boot chain; asks the user for nothing.
                    o += `\n# ── Libre OTP: silent boot-integrity check ──\n`;
                    o += `# One secret is generated here and never displayed. At each boot the\n`;
                    o += `# expected value is recomputed and compared internally; a mismatch means\n`;
                    o += `# the boot chain was modified since this install.\n`;
                    // Was `--setup-tamper-check --hash sha512`. Neither the flag nor
                    // the space-separated value exists: libre-otp parses argv by hand
                    // and looks for `--setup` and `--hash=`. The old line failed
                    // outright, so no baseline was ever sealed.
                    o += `libre-otp --setup --hash=sha512\n`;
                    o += `chmod 600 /etc/arch-security/otp.seal\n`;
                    o += `chown root:root /etc/arch-security/otp.seal\n\n`;

                    o += `# Verify the boot chain early, before the passphrase prompt, so a warning\n`;
                    o += `# reaches the user while it still matters.\n`;
                    /* The warning itself, identical wherever it runs. Held once
                       because the two initramfs generators disagree about the
                       wrapper around it and about nothing inside it. */
                    const otpWarn = [
                        `    printf '\\n\\033[1;31m########################################\\033[0m\\n'`,
                        `    printf '\\033[1;31m##  BOOT INTEGRITY CHECK FAILED       ##\\033[0m\\n'`,
                        `    printf '\\033[1;31m########################################\\033[0m\\n\\n'`,
                        `    printf 'The boot chain does not match what was recorded at install.\\n'`,
                        `    printf 'This can mean tampering, or simply a kernel or firmware update.\\n\\n'`,
                        `    printf 'Do NOT enter your passphrase if you did not expect this.\\n'`,
                        `    printf 'Re-seal after a legitimate update with: libre-otp --setup\\n\\n'`,
                        `    printf 'Press Enter to continue anyway, or power off now. '`,
                        `    read _ack`
                    ];
                    if (M.initramfs === null && isGentoo) {
                        /* Dracut's equivalent of an mkinitcpio hook is a module
                           directory with a module-setup.sh that says what to
                           copy in and where in the boot sequence to run it.
                           `pre-mount` is before the root filesystem is opened,
                           which is the same position `encrypt` occupies on the
                           other side — the point being that the warning has to
                           arrive before the passphrase is typed, not after. */
                        o += `mkdir -p /usr/lib/dracut/modules.d/95otp-tamper\n`;
                        o += `cat > /usr/lib/dracut/modules.d/95otp-tamper/otp-tamper.sh << 'OTPHOOK'\n`;
                        o += `#!/bin/sh\n`;
                        o += `[ -f /etc/arch-security/otp.seal ] || exit 0\n`;
                        o += `if /usr/local/bin/libre-otp --verify-tamper --quiet; then\n`;
                        o += `    exit 0\n`;
                        o += `fi\n`;
                        // No enclosing function here, so the hook body sits at
                        // the top level of the script rather than inside one.
                        otpWarn.forEach(l => { o += `${l.replace(/^ {4}/, '')}\n`; });
                        o += `OTPHOOK\n`;
                        o += `chmod 755 /usr/lib/dracut/modules.d/95otp-tamper/otp-tamper.sh\n\n`;
                        o += `cat > /usr/lib/dracut/modules.d/95otp-tamper/module-setup.sh << 'OTPINST'\n`;
                        o += `#!/bin/bash\n`;
                        o += `check() { return 0; }\n`;
                        o += `depends() { echo crypt; }\n`;
                        o += `install() {\n`;
                        o += `    inst_multiple /usr/local/bin/libre-otp\n`;
                        o += `    inst_simple /etc/arch-security/otp.seal\n`;
                        o += `    inst_hook pre-mount 10 "$moddir/otp-tamper.sh"\n`;
                        o += `}\n`;
                        o += `OTPINST\n`;
                        o += `chmod 755 /usr/lib/dracut/modules.d/95otp-tamper/module-setup.sh\n`;
                        o += `echo 'add_dracutmodules+=" otp-tamper "' >> /etc/dracut.conf.d/otp.conf\n`;
                        o += `dracut --force\n\n`;

                        /* Portage has no equivalent of an ALPM hook that fires
                           on one package, so this is a plain reminder rather
                           than automation dressed up as automation. */
                        o += `# Re-seal after any kernel update, or every update looks like tampering\n`;
                        o += `# and the warning stops meaning anything:\n`;
                        o += `#   libre-otp --setup\n`;
                        o += `# Portage has no per-package post-install hook to do this for you.\n`;
                    } else {
                        o += `cat > /etc/initcpio/hooks/otp-tamper << 'OTPHOOK'\n`;
                        o += `#!/usr/bin/ash\n`;
                        o += `run_hook() {\n`;
                        o += `    [ -f /etc/arch-security/otp.seal ] || return 0\n`;
                        o += `    if /usr/local/bin/libre-otp --verify-tamper --quiet; then\n`;
                        o += `        return 0\n`;
                        o += `    fi\n`;
                        otpWarn.forEach(l => { o += `${l}\n`; });
                        o += `}\n`;
                        o += `OTPHOOK\n`;
                        o += `chmod 755 /etc/initcpio/hooks/otp-tamper\n\n`;

                        o += `cat > /etc/initcpio/install/otp-tamper << 'OTPINST'\n`;
                        o += `#!/bin/bash\n`;
                        o += `build() {\n`;
                        o += `    add_runscript\n`;
                        o += `    add_binary /usr/local/bin/libre-otp\n`;
                        o += `    add_file /etc/arch-security/otp.seal\n`;
                        o += `}\n`;
                        o += `help() { echo "Silent Libre OTP boot-integrity check."; }\n`;
                        o += `OTPINST\n`;
                        o += `chmod 755 /etc/initcpio/install/otp-tamper\n`;
                        o += `sed -i 's/\\(HOOKS=.*\\)\\(encrypt\\|sd-encrypt\\)/\\1otp-tamper \\2/' /etc/mkinitcpio.conf\n`;
                        o += `mkinitcpio -P\n\n`;

                        o += `# Re-seal automatically after a kernel update, or every update would\n`;
                        o += `# look like tampering and the warning would be ignored.\n`;
                        o += `cat > /usr/share/libalpm/hooks/95-otp-reseal.hook << 'RESEAL'\n`;
                        o += `[Trigger]\nOperation = Install\nOperation = Upgrade\nType = Package\nTarget = linux\nTarget = linux-*\n\n`;
                        o += `[Action]\nDescription = Re-sealing Libre OTP boot integrity baseline...\nWhen = PostTransaction\nExec = /usr/local/bin/libre-otp --setup\n`;
                        o += `RESEAL\n`;
                    }

                    if (!cmdOnly) {
                        o += `\`\`\`\n\n`;
                        o += `> [!IMPORTANT]\n`;
                        o += `> This check runs **after** your firmware. An attacker who can reflash the\n`;
                        o += `> firmware or boot other media defeats it. It is only meaningful alongside\n`;
                        o += `> Secure Boot with your own keys, a firmware supervisor password, and\n`;
                        o += `> USB/network boot disabled. For tamper-evidence at the firmware level you\n`;
                        o += `> need measured boot — see the Hardware & Firmware Security wiki section.\n\n`;
                        o += `\`\`\`bash\n`;
                    }
                } else {
                    // Interactive 2FA. SHA-512 internally; SHA-1 only where an
                    // authenticator app has to be able to read it.
                    o += `\n# Configuring Libre OTP (interactive 2FA)\n`;
                    o += `libre-otp --setup --mode ${libreOtpMode} --hash sha1 --recovery-codes 5\n`;
                    o += `\n# Injecting Libre OTP into PAM\n`;
                    const pamLine = `auth required pam_exec.so expose_authtok quiet /usr/local/bin/libre-otp verify`;
                    if (libreOtpMode === "login" || libreOtpMode === "both") {
                        /* Every way of becoming root, and each covered exactly once.
                           doas was missing entirely, which mattered because this
                           project installs doas and can alias sudo to it — so on
                           those machines the second factor was written into three
                           files and absent from the one the user actually types.

                           The rest of this is about not covering anything twice.
                           On Arch, /etc/pam.d/su, sudo, doas and sshd normally
                           consist of `include system-auth`, so a line appended to
                           system-auth already reaches all of them; appending to
                           both would prompt for the code twice and read as a
                           rejected login. The previous version appended to
                           system-auth AND su AND sudo unconditionally, which is
                           that bug for anyone whose stack includes.

                           Rather than assume a layout, the script looks: a file
                           that already reaches system-auth is left alone, and one
                           that does not gets its own copy. The grep guard makes
                           the whole thing safe to run twice.

                           opendoas on Linux is built against PAM and reads
                           /etc/pam.d/doas. OpenBSD's doas is not and does not —
                           that is BSD auth, a separate integration, not claimed
                           here and not emitted for OpenBSD. */
                        o += `_otp_pam=${JSON.stringify(pamLine)}\n`;
                        o += `grep -qF "$_otp_pam" /etc/pam.d/system-auth || echo "$_otp_pam" >> /etc/pam.d/system-auth\n`;
                        o += `for _f in su sudo doas${effectiveSuite.includes('openssh') ? ' sshd' : ''}; do\n`;
                        o += `    [ -f "/etc/pam.d/$_f" ] || continue\n`;
                        o += `    # Already reaches system-auth? Then it is covered once already.\n`;
                        o += `    grep -Eq '^[[:space:]]*auth[[:space:]]+(include|substack)[[:space:]]+system-auth' "/etc/pam.d/$_f" && continue\n`;
                        o += `    grep -qF "$_otp_pam" "/etc/pam.d/$_f" || echo "$_otp_pam" >> "/etc/pam.d/$_f"\n`;
                        o += `done\n`;
                        o += `unset _f _otp_pam\n`;
                        o += `# Every file that now demands a code. Check this before logging out.\n`;
                        o += `grep -l libre-otp /etc/pam.d/* 2>/dev/null\n`;
                    }
                    if (libreOtpMode === "boot" || libreOtpMode === "both") {
                        o += `# Boot-time prompt lives in the initramfs, not PAM.\n`;
                        // `--install-initramfs-hook` does not exist and never has, so
                        // this step failed silently and the boot prompt was never
                        // actually installed on any machine that ran the script.
                        // Writing the hook directly is what the flag would have done.
                        if (M.initramfs === null && isGentoo) {
                            /* Same gate, dracut's shape. The ordering
                               requirement is identical and is expressed by the
                               hook point rather than by a position in a list:
                               `cmdline` runs before `crypt` unlocks anything,
                               which is what makes the prompt come first. */
                            o += `mkdir -p /usr/lib/dracut/modules.d/90libre-otp\n`;
                            o += `cat > /usr/lib/dracut/modules.d/90libre-otp/libre-otp.sh << 'OTPHOOK'\n`;
                            o += `#!/bin/sh\n`;
                            o += `/usr/local/bin/libre-otp --gate || exit 1\n`;
                            o += `OTPHOOK\n`;
                            o += `cat > /usr/lib/dracut/modules.d/90libre-otp/module-setup.sh << 'OTPINST'\n`;
                            o += `#!/bin/bash\n`;
                            o += `check() { return 0; }\n`;
                            o += `depends() { echo crypt; }\n`;
                            o += `install() {\n`;
                            o += `    inst_multiple /usr/local/bin/libre-otp\n`;
                            o += `    inst_hook cmdline 90 "$moddir/libre-otp.sh"\n`;
                            o += `}\n`;
                            o += `OTPINST\n`;
                            o += `chmod 755 /usr/lib/dracut/modules.d/90libre-otp/libre-otp.sh \\\n`;
                            o += `          /usr/lib/dracut/modules.d/90libre-otp/module-setup.sh\n`;
                            o += `echo 'add_dracutmodules+=" libre-otp "' >> /etc/dracut.conf.d/otp.conf\n`;
                            o += `dracut --force\n`;
                        } else {
                            o += `cat > /etc/initcpio/hooks/libre-otp << 'OTPHOOK'\n`;
                            o += `#!/usr/bin/env bash\n`;
                            o += `run_hook() {\n`;
                            o += `    /usr/local/bin/libre-otp --gate || exit 1\n`;
                            o += `}\n`;
                            o += `OTPHOOK\n`;
                            o += `cat > /etc/initcpio/install/libre-otp << 'OTPINST'\n`;
                            o += `#!/usr/bin/env bash\n`;
                            o += `build() {\n`;
                            o += `    add_binary /usr/local/bin/libre-otp\n`;
                            o += `    add_runscript\n`;
                            o += `}\n`;
                            o += `help() { echo "Prompts for a Libre OTP code before unlocking."; }\n`;
                            o += `OTPINST\n`;
                            o += `chmod 755 /etc/initcpio/hooks/libre-otp /etc/initcpio/install/libre-otp\n`;
                            o += `# Must precede 'encrypt' in HOOKS= or it never runs.\n`;
                            o += `sed -i 's/\\(^HOOKS=.*\\)\\bencrypt\\b/\\1libre-otp encrypt/' /etc/mkinitcpio.conf\n`;
                            o += `grep -n '^HOOKS=' /etc/mkinitcpio.conf   # confirm before rebooting\n`;
                            o += `${M.initramfs}\n`;
                        }
                    }
                    // sshd is covered by the loop above, which adds a line only
                    // to files that do not already reach system-auth. Appending
                    // here as well was the other half of the double-prompt bug.
                    o += `\n# Recovery codes are printed once. Store them OFF this machine.\n`;
                    o += `echo "Recovery codes were printed above. Write them down now — without them,"\n`;
                    o += `echo "a lost authenticator means you cannot log in."\n`;
                }
            }

            if (effectiveSuite.includes('panic-password')) {
                o += `\n# Configuring Panic Password\nlibre-otp --setup-panic\n`;
            }

            if (effectiveSuite.includes('anti-evil-maid')) {
                if (cmdOnly) {
                    o += `\n# Configuring Anti-Evil Maid (Interactive)\n`;
                    o += `echo -e "\\n\\e[38;2;247;118;142m>> Anti-Evil Maid Configuration\\e[0m"\n`;
                    o += `echo "Decoy Kernels setup:"\n`;
                    o += `echo "1) 1 Decoy Kernel"\n`;
                    o += `echo "2) 2 Decoy Kernels"\n`;
                    o += `echo "3) Random (Cryptographically secure selection)"\n`;
                    o += `read -p "Select Decoy Mode (1-3): " aem_decoy_mode\n`;
                    o += `case "$aem_decoy_mode" in\n`;
                    o += `  1) DECOY_MODE="--decoy-count 1" ;;\n`;
                    o += `  2) DECOY_MODE="--decoy-count 2" ;;\n`;
                    o += `  3) DECOY_MODE="--decoy-count random" ;;\n`;
                    o += `  *) DECOY_MODE="--decoy-count 1" ;;\n`;
                    o += `esac\n`;
                    o += `anti-evil-maid --setup --main-kernel ${aem_main} --backup-kernel ${aem_backup} $DECOY_MODE\n`;
                } else {
                    o += `\n# Configuring Anti-Evil Maid\nanti-evil-maid --setup --main-kernel ${aem_main} --backup-kernel ${aem_backup} --decoy-count 1\n`;
                }

                // ── Decoy & Duress Passwords for Anti-Evil Maid ──
                // Three independent PINs, matching the walkthrough exactly. The
                // two modal selects this replaces could only express two of the
                // three states — "both at once" had to be inferred from having
                // set the other two, which is not the same thing: it is a third
                // separate password with its own hash, not a combination.
                const duressPins = Array.from(
                    document.querySelectorAll('input[name="duress_pins"]:checked')
                ).map(c => c.value);
                const aemDecoyMode = duressPins.includes('decoy') ? 'session' : 'none';
                const aemDuressMode = duressPins.includes('duress') ? 'erase' : 'none';
                const aemBothPin = duressPins.includes('both');

                // Decoy and duress passwords are scarecrow's job, not
                // anti-evil-maid's. This block previously called
                // `anti-evil-maid --decoy-password "$PASS" --decoy-mode …` and
                // `--duress-password "$PASS" --wipe-method …`. None of those
                // four flags exist in the crate, so every one of these lines
                // failed — and worse, they put the duress password on the
                // command line, where `ps` shows it to every user on the
                // machine. A duress password that any local process can read is
                // not a duress password.
                //
                // scarecrow implements this properly: three separate PINs, each
                // prompted for interactively and never passed as an argument,
                // each hashed with Argon2id and stored root-only 0600.
                //
                // A duress PIN erases a LUKS header. On an unencrypted install
                // there is none to erase, so the whole block is suppressed
                // rather than emitting commands that cannot work — the same
                // guard the walkthrough emitter needed.
                const aemEncrypted = part !== "unencrypted";
                if (aemEncrypted && (aemDecoyMode !== 'none' || aemDuressMode !== 'none' || aemBothPin)) {
                    o += `\n# ── Duress and decoy PINs (scarecrow) ──\n`;
                    o += `# These are entered at the login prompt instead of your real password.\n`;
                    o += `# scarecrow prompts for each one; nothing is passed on the command\n`;
                    o += `# line, where ps would show it to every user on the machine.\n`;
                    // "both" erases too, so it needs the header backup and the
                    // duress device set just as much as plain duress does.
                    // Guarding on duress alone would let someone tick only
                    // "both" and get an erasing PIN with no backup taken and no
                    // device named — and with no device named, the erase
                    // silently does nothing at the moment it is needed.
                    if (aemDuressMode !== 'none' || aemBothPin) {
                        o += `#\n`;
                        o += `# Back the LUKS header up FIRST. A duress PIN erases it, and without\n`;
                        o += `# a backup that is unrecoverable — which is the intent, but it also\n`;
                        o += `# means a mistake is final. Keep the backup off this machine.\n`;
                        o += `cryptsetup luksHeaderBackup ${partRoot} --header-backup-file /root/luks-header-backup.img\n`;
                        o += `echo "Header backed up to /root/luks-header-backup.img — MOVE IT OFF THIS MACHINE."\n`;
                        o += `\n# Name the device a duress PIN erases. Nothing is erased until this is\n`;
                        o += `# set: scarecrow will not guess which disk to destroy.\n`;
                        o += `scarecrow --set-duress-device ${partRoot}\n`;
                    }
                    if (aemBothPin) {
                        o += `\n# Erases the header AND opens a working decoy session, so there is no\n`;
                        o += `# sign on screen that either happened.\n`;
                        o += `scarecrow --set-duress-decoy-pin\n`;
                    }
                    if (aemDuressMode !== 'none') {
                        o += `\n# Erases the header, then behaves exactly like a wrong password.\n`;
                        o += `scarecrow --set-duress-pin\n`;
                    }
                    if (aemDecoyMode !== 'none') {
                        o += `\n# A working session in a decoy home. Erases nothing.\n`;
                        o += `scarecrow --set-decoy-pin\n`;
                    }

                    // More than one PIN means they might share a password, and
                    // that changes behaviour rather than just being untidy:
                    // scarecrow verifies all three slots with no early exit and
                    // takes the MOST DESTRUCTIVE match. So a decoy PIN that
                    // happens to equal the duress PIN erases the header.
                    if (duressPins.length > 1) {
                        o += `\n# You set ${duressPins.length} PINs. If any two share a password,\n`;
                        o += `# scarecrow takes the MOST DESTRUCTIVE interpretation — under\n`;
                        o += `# coercion is the wrong moment to resolve an ambiguity in favour\n`;
                        o += `# of doing less. A decoy PIN equal to the duress PIN erases.\n`;
                        o += `echo "You configured ${duressPins.length} duress PINs."\n`;
                        o += `echo "Use a DIFFERENT password for each, unless you specifically want"\n`;
                        o += `echo "the most destructive one to win. Verify now, while you safely can:"\n`;
                        o += `echo "  scarecrow --login   # enter each PIN, confirm it does what you expect"\n`;
                    }

                    // Setting a PIN configures nothing on its own — something
                    // has to check it. Without this the PINs were enrolled and
                    // then never reached, which is the worst state to be in:
                    // you believe you have a duress PIN and you do not.
                    o += `\n# Wire the PINs into the LOGIN prompt (not the boot passphrase\n`;
                    o += `# prompt — these are checked after the disk is already unlocked).\n`;
                    o += `# Stock pam_exec, so no custom PAM module and it works anywhere PAM\n`;
                    o += `# does: login, greetd, sddm, gdm, su.\n`;
                    o += `sed -i '0,/^auth.*pam_unix\\.so/s##auth [success=done default=ignore] pam_exec.so expose_authtok quiet /usr/bin/scarecrow --pam-gate\\n&#' /etc/pam.d/system-auth\n`;
                    o += `grep -n -A1 scarecrow /etc/pam.d/system-auth\n`;
                    o += `echo "PAM gate installed. Your real password still works: a non-matching"\n`;
                    o += `echo "PIN exits non-zero and default=ignore hands the decision to pam_unix."\n`;
                    o += `echo "Test logging in on another TTY BEFORE you log out of this one — a"\n`;
                    o += `echo "mistake in system-auth locks out every account including root."\n`;
                    if (aemDecoyMode !== 'none') {
                        o += `\n# Send a decoy session to the decoy home. The marker lives in /run,\n`;
                        o += `# so it is tmpfs and cannot survive a reboot — a stale one would drop\n`;
                        o += `# you into the decoy home on an ordinary login, which looks exactly\n`;
                        o += `# like your data having been lost.\n`;
                        o += `cat > /etc/profile.d/scarecrow-decoy.sh << 'DECOYPROFILE'\n`;
                        o += `if [ -f /run/scarecrow/decoy-session ]; then\n`;
                        o += `    export HOME=/etc/arch-security/scarecrow/decoy-home\n`;
                        o += `    cd "$HOME" || true\n`;
                        o += `fi\n`;
                        o += `DECOYPROFILE\n`;
                        o += `chmod 0644 /etc/profile.d/scarecrow-decoy.sh\n`;
                    }
                }

                // ── LUKS auto-lock ──
                // Locking the screen leaves the master key in kernel memory.
                // luksSuspend flushes it, which is the difference between a UI
                // lock and a cryptographic one.
                const aemAutolock = document.getElementById('modal_aem_autolock')?.value || 'never';
                if (aemEncrypted && aemAutolock !== 'never') {
                    o += `\n# ── LUKS auto-lock ──\n`;
                    o += `# Suspends the volume and flushes the master key from RAM. A screen\n`;
                    o += `# lock does not do this: the key stays resident while the volume is\n`;
                    o += `# open, where a DMA port or a cold-boot attack can still reach it.\n`;
                    if (aemAutolock === 'on-lock') {
                        o += `anti-evil-maid --configure-autolock --idle never\n`;
                        o += `echo "Point your screen locker at /usr/local/bin/anti-evil-maid-on-lock"\n`;
                    } else {
                        o += `anti-evil-maid --configure-autolock --idle ${aemAutolock}\n`;
                        if (openrc) {
                            /* The crate writes systemd units and nothing else.
                               On OpenRC those files are written and never read,
                               so the auto-lock would appear configured and never
                               fire — worse than not offering it, because the
                               owner would believe the key was flushed. Said
                               plainly rather than emitting an enable command for
                               a unit no init here will run. */
                            o += `# NOT ENABLED: anti-evil-maid --configure-autolock writes systemd\n`;
                            o += `# units, and this system does not run systemd. The configuration\n`;
                            o += `# above is written and the timer will not fire. Lock on demand\n`;
                            o += `# with 'anti-evil-maid --lock-now' until an OpenRC service exists.\n`;
                        } else {
                            o += `systemctl enable anti-evil-maid-autolock.timer\n`;
                        }
                    }
                    // Make the lock screen an actual boundary: a watcher for
                    // logind's session-lock signal suspends the volume the
                    // moment the screen locks, so the key does not sit in RAM
                    // for as long as the owner is away.
                    if ((document.getElementById('modal_aem_lock_on_screen')?.value || 'no') === 'yes') {
                        o += `\n# Suspend LUKS whenever the session locks.\n`;
                        o += `${instNeeded(['dbus'])}\n`;
                        o += `anti-evil-maid --install-lock-hook\n`;
                        if (openrc) {
                            /* The watcher listens for logind's session-lock
                               signal. elogind provides the same D-Bus interface
                               under OpenRC, so the mechanism is available — but
                               the unit the tool writes is a systemd one. */
                            o += `${instNeeded(['elogind'])}\n`;
                            /* The watcher itself is a plain dbus-monitor loop at
                               a fixed path, so it is init-agnostic; only the
                               unit the tool writes is systemd's. An OpenRC
                               service script for the same binary is written
                               here rather than leaving the feature installed
                               and never started. */
                            o += `cat > /etc/init.d/anti-evil-maid-lock-watch << 'AEMWATCH'\n`;
                            o += `#!/sbin/openrc-run\n`;
                            o += `description="Suspend the LUKS volume when the session locks"\n`;
                            o += `command="/usr/local/bin/anti-evil-maid-lock-watch"\n`;
                            o += `command_background=true\n`;
                            o += `pidfile="/run/anti-evil-maid-lock-watch.pid"\n`;
                            o += `depend() { need dbus; }\n`;
                            o += `AEMWATCH\n`;
                            o += `chmod 755 /etc/init.d/anti-evil-maid-lock-watch\n`;
                            o += `${svc('anti-evil-maid-lock-watch')}\n`;
                        } else {
                            o += `systemctl enable anti-evil-maid-lock-watch.service\n`;
                        }
                    }
                    o += `echo "Test this before relying on it: suspending the root volume freezes"\n`;
                    o += `echo "all disk I/O until the passphrase is typed, and a mistake needs a"\n`;
                    o += `echo "power cycle. Lock on demand with: anti-evil-maid --lock-now"\n`;
                }

                // Boot-integrity daemon, wrapped so a failed check is reported on
                // every available channel rather than only to the journal.
                o += `\n# Boot integrity check with alerting on every channel.\n`;
                o += `cat > /usr/local/bin/aem-boot-check << 'AEMCHECK'\n`;
                o += `#!/bin/bash\n`;
                o += `# Runs the Anti-Evil Maid check and escalates a failure loudly.\n`;
                o += `set -u\n`;
                o += `REPORT=$(mktemp)\n`;
                o += `if /usr/local/bin/anti-evil-maid --daemon > "$REPORT" 2>&1; then\n`;
                o += `  rm -f "$REPORT"; exit 0\n`;
                o += `fi\n`;
                o += `{\n`;
                o += `  echo "What was checked:"\n`;
                o += `  echo "  - EFI variables hash"\n`;
                o += `  echo "  - /boot contents hash"\n`;
                o += `  echo "  - Hardware ID (board UUID + MAC addresses)"\n`;
                o += `  echo "  - TPM PCR values"\n`;
                o += `  echo ""\n`;
                o += `  cat "$REPORT"\n`;
                o += `  echo ""\n`;
                o += `  echo "Legitimate causes: a kernel update, a firmware update, changed"\n`;
                o += `  echo "boot settings, or added/removed hardware. If you just did one of"\n`;
                o += `  echo "those, re-baseline with: anti-evil-maid --setup"\n`;
                o += `  echo ""\n`;
                o += `  echo "If you did NOT: stop using this machine. Back up your data from a"\n`;
                o += `  echo "live medium and reinstall. Do not enter passwords in the meantime."\n`;
                o += `} > "$REPORT.full"\n`;
                o += `/usr/local/bin/security-alert critical "Boot integrity check FAILED" \\\n`;
                o += `  "The boot chain does not match the recorded baseline." "$REPORT.full"\n`;
                o += `rm -f "$REPORT" "$REPORT.full"\n`;
                o += `AEMCHECK\n`;
                o += `chmod 700 /usr/local/bin/aem-boot-check\n\n`;
                /* The check itself is a script at a fixed path, so only the
                   thing that starts it at boot differs. Written for the init
                   that is actually present rather than writing a systemd unit
                   and hoping. */
                if (openrc) {
                    o += `cat << 'AEM_DAEMON' > /etc/init.d/aem\n#!/sbin/openrc-run\ndescription="Anti-Evil Maid boot integrity check"\ncommand="/usr/local/bin/aem-boot-check"\ndepend() { after net; }\nAEM_DAEMON\n`;
                    o += `chmod 755 /etc/init.d/aem\n`;
                    o += `${svc('aem')}\n`;
                } else {
                    o += `cat << 'AEM_DAEMON' > /etc/systemd/system/aem.service\n[Unit]\nDescription=Anti-Evil Maid boot integrity check\nAfter=network.target\n\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/aem-boot-check\nRemainAfterExit=yes\n\n[Install]\nWantedBy=multi-user.target\nAEM_DAEMON\n`;
                    o += `systemctl enable aem.service\n`;
                }

                // Periodic filesystem hash checks
                o += `cat << 'AEM_HASH' > /usr/local/bin/aem-fs-hash-check.sh\n#!/bin/bash\nanti-evil-maid --fs-hash-check >> /var/log/aem-fs-hash.log 2>&1\nAEM_HASH\n`;
                o += `chmod +x /usr/local/bin/aem-fs-hash-check.sh\n`;
                o += `(crontab -l 2>/dev/null; echo "0 * * * * /usr/local/bin/aem-fs-hash-check.sh") | crontab -\n`;
            }

            if (effectiveSuite.includes('anti-ducky')) {
                // This used to run `anti-ducky --approve-current`, a flag the
                // crate does not have — clap rejects it, and in a chroot the
                // install would fail on a line that never worked.
                //
                // Enrolment is also deliberately NOT done here. It is
                // interactive, and the devices attached during an install are
                // not the devices the machine is used with. Enabling the daemon
                // before enrolment locks the owner out of their own keyboard,
                // so the unit is installed and left stopped until they run it.
                o += `\n# Anti-Ducky: installed, NOT enabled.\n`;
                o += `# Enrolment is interactive and must happen on the real machine with\n`;
                o += `# the real keyboards attached, or the daemon sandboxes the keyboard\n`;
                o += `# you log in with.\n`;
                o += `mkdir -p /etc/motd.d\n`;
                o += `cat > /etc/motd.d/10-anti-ducky << 'DUCKYMOTD'\n`;
                o += `Anti-Ducky is installed but not running. Before enabling it:\n`;
                o += `  1. Plug in every keyboard, mouse and dock you actually use.\n`;
                o += `  2. sudo anti-ducky --enroll          # confirms each device in turn\n`;
                o += `  3. sudo anti-ducky --export-whitelist  # check what it now trusts\n`;
                o += `  4. sudo ${svcNow(openrc ? 'anti-ducky' : 'anti-ducky.service')}\n`;
                o += `DUCKYMOTD\n`;

                // What happens after a payload is confirmed. Capture and
                // deauthorization are unconditional; this is the extra step.
                const duckyResponse = gv('ducky_response', 'lock');
                o += `\n# Response to a confirmed payload. The payload is captured to\n`;
                o += `# /var/log/anti-ducky/ with a SHA-256, and the device is deauthorized\n`;
                o += `# at the kernel, whichever of these is set.\n`;
                if (duckyResponse === 'lockdown') {
                    o += `# Staged: sessions locked, kernel lockdown raised to confidentiality,\n`;
                    o += `# LUKS suspended so the master key leaves RAM, then power cut via\n`;
                    o += `# sysrq. A plain power-off leaves several seconds where the key is\n`;
                    o += `# still in RAM and the desktop is still unlocked behind whatever the\n`;
                    o += `# payload typed. Prompts for typed confirmation.\n`;
                    o += `anti-ducky --set-response lockdown\n`;
                    o += `echo "Lockdown needs anti-evil-maid configured to flush the key:"\n`;
                    o += `echo "  anti-evil-maid --configure-autolock"\n`;
                    o += `echo "Without it the lockdown still locks and still powers off."\n`;
                } else if (duckyResponse === 'poweroff') {
                    o += `# Hard power-off: clears the disk-encryption keys from RAM before\n`;
                    o += `# anyone can pull the DIMMs. Loses unsaved work on a false positive,\n`;
                    o += `# and these timing thresholds have never been measured on real\n`;
                    o += `# hardware. Prompts for typed confirmation.\n`;
                    o += `anti-ducky --set-response poweroff\n`;
                } else if (duckyResponse === 'alert') {
                    o += `anti-ducky --set-response alert\n`;
                } else {
                    o += `anti-ducky --set-response lock\n`;
                }

                // Without this, a power-off response takes the on-screen warning
                // with it and the attack leaves nothing the owner will ever see.
                o += `\n# Show the alert after the next boot.\n`;
                if (openrc) {
                    o += `cat > /etc/init.d/anti-ducky-boot-alert << 'DUCKYBOOT'\n`;
                    o += `#!/sbin/openrc-run\n`;
                    o += `description="Show any BadUSB alert recorded before this boot"\n`;
                    o += `command="/usr/bin/anti-ducky"\n`;
                    o += `command_args="--show-boot-alerts"\n`;
                    o += `# The warning has to land somewhere a person will see it, which is the\n`;
                    o += `# console rather than a log file.\n`;
                    o += `output_log="/dev/tty1"\n`;
                    o += `error_log="/dev/tty1"\n`;
                    o += `DUCKYBOOT\n`;
                    o += `chmod 755 /etc/init.d/anti-ducky-boot-alert\n`;
                } else {
                    o += `cat > /etc/systemd/system/anti-ducky-boot-alert.service << 'DUCKYBOOT'\n`;
                    o += `[Unit]\n`;
                    o += `Description=Show any BadUSB alert recorded before this boot\n`;
                    o += `After=multi-user.target\n`;
                    o += `\n`;
                    o += `[Service]\n`;
                    o += `Type=oneshot\n`;
                    o += `ExecStart=/usr/bin/anti-ducky --show-boot-alerts\n`;
                    o += `StandardOutput=tty\n`;
                    o += `TTYPath=/dev/tty1\n`;
                    o += `\n`;
                    o += `[Install]\n`;
                    o += `WantedBy=multi-user.target\n`;
                    o += `DUCKYBOOT\n`;
                }
                o += `${svc(openrc ? 'anti-ducky-boot-alert' : 'anti-ducky-boot-alert.service')}\n`;
                // Report the full device identity, so the user can judge it rather
                // than just being told "something happened".
                o += `\n# Alert on an unrecognised USB input device, with its full identity.\n`;
                o += `cat > /etc/udev/rules.d/98-anti-ducky-alert.rules << 'DUCKYALERT'\n`;
                o += `ACTION=="add", SUBSYSTEM=="input", ENV{ID_INPUT_KEYBOARD}=="1", RUN+="/usr/local/bin/anti-ducky-notify"\n`;
                o += `DUCKYALERT\n`;
                o += `cat > /usr/local/bin/anti-ducky-notify << 'DUCKYNOTIFY'\n`;
                o += `#!/bin/bash\n`;
                o += `# Called by udev when a keyboard-capable device appears.\n`;
                o += `set -u\n`;
                o += `ALLOWLIST=/etc/arch-security/usb-allowlist\n`;
                o += `ID="\${ID_VENDOR_ID:-?}:\${ID_MODEL_ID:-?}"\n`;
                o += `[ -f "$ALLOWLIST" ] && grep -qx "$ID" "$ALLOWLIST" && exit 0\n`;
                o += `DETAIL=$(mktemp)\n`;
                o += `{\n`;
                o += `  echo "Device details:"\n`;
                o += `  echo "  Vendor:product : $ID"\n`;
                o += `  echo "  Vendor name    : \${ID_VENDOR:-unknown}"\n`;
                o += `  echo "  Model name     : \${ID_MODEL:-unknown}"\n`;
                o += `  echo "  Serial         : \${ID_SERIAL_SHORT:-none}"\n`;
                o += `  echo "  Device path    : \${DEVPATH:-unknown}"\n`;
                o += `  echo "  Claims to be   : keyboard / HID"\n`;
                o += `  echo ""\n`;
                o += `  echo "A BadUSB device can present ANY vendor, model and serial it likes."\n`;
                o += `  echo "These details are what the device claims, not what it is. A device"\n`;
                o += `  echo "that says it is your keyboard may be a keystroke injector."\n`;
                o += `  echo ""\n`;
                o += `  echo "If you did not just plug this in, unplug it before touching the keyboard."\n`;
                o += `  echo "To trust it: echo '$ID' >> $ALLOWLIST && udevadm control --reload-rules"\n`;
                o += `} > "$DETAIL"\n`;
                o += `/usr/local/bin/security-alert critical "Unrecognised keyboard device" \\\n`;
                o += `  "An input device not on the allowlist was connected: $ID" "$DETAIL"\n`;
                o += `rm -f "$DETAIL"\n`;
                o += `DUCKYNOTIFY\n`;
                o += `chmod 700 /usr/local/bin/anti-ducky-notify\n`;
                o += `udevadm control --reload-rules\n`;
            }

            if (effectiveSuite.includes('openssh')) {
                o += `\n# Hardening SSH Server\n`;
                o += `sed -i 's/^#*PermitRootLogin.*/PermitRootLogin ${root_ssh === 'yes' ? 'prohibit-password' : 'no'}/' /etc/ssh/sshd_config\n`;
                o += `sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config\n`;
                o += `sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config\n`;
                o += `ssh-keygen -A\n${svc('sshd')}\n`;
            }

            if (effectiveSuite.includes('kloak')) {
                o += `\n# Installing Kloak (keystroke timing anonymisation)\n${svc('kloak')}\n`;
            }

            if (effectiveSuite.includes('kernel-watcher')) {
                o += `\n# Configuring Kernel Watcher (Semi-EDR)\nkernel-watcher --setup\n`;
                o += `cat << 'KW' > /etc/systemd/system/kernel-watcher.service\n[Unit]\nDescription=Kernel Watcher EDR daemon\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/kernel-watcher\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\nKW\n`;
                o += `${svc(openrc ? 'kernel-watcher' : 'kernel-watcher.service')}\n`;
            }

            if (effectiveSuite.includes('scarecrow')) {
                o += `\n# Configuring Scarecrow (canary tokens / sandbox spoofing)\n`;
                o += `cat << 'SC' > /etc/systemd/system/scarecrow.service\n[Unit]\nDescription=Scarecrow canary token monitor\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/scarecrow\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\nSC\n`;
                o += `${svc(openrc ? 'scarecrow' : 'scarecrow.service')}\n`;
            }
        }

        // ── USB kill switch ──
        if (usb_kill !== 'none') {
            o += buildUsbKill(usb_kill, usb_kill_trigger, cmdOnly);
        }

        // Third-party hardening tools (checkbox group `other_sec_tools`).
        if (other_sec_tools.length > 0) {
            if (!cmdOnly) o += `\`\`\`\n\n## 8. Other Security Hardening\n\`\`\`bash\n`;
            else o += `\n# 8. Other Security Tools\n`;

            if (other_sec_tools.includes('apparmor')) {
                o += `${inst(['apparmor'])}\n`;
                // Only GRUB reads /etc/default/grub; UKI/systemd-boot use the cmdline file.
                if (boot === 'grub') {
                    o += `sed -i 's/^GRUB_CMDLINE_LINUX="/GRUB_CMDLINE_LINUX="apparmor=1 lsm=landlock,lockdown,yama,apparmor,bpf /' /etc/default/grub\n`;
                    o += `grub-mkconfig -o /boot/grub/grub.cfg\n`;
                } else {
                    o += `echo 'apparmor=1 lsm=landlock,lockdown,yama,apparmor,bpf' >> /etc/kernel/cmdline\n`;
                }
                o += `${svc('apparmor')}\n`;
            }
            if (other_sec_tools.includes('usbguard')) {
                o += `${inst(['usbguard'])}\nusbguard generate-policy > /etc/usbguard/rules.conf\n${svc('usbguard')}\n`;
            }
            if (other_sec_tools.includes('auditd')) {
                o += `${inst(['audit'])}\n${svc('auditd')}\n`;
                o += `echo '-w /etc/passwd -p wa -k passwd_changes' >> /etc/audit/rules.d/audit.rules\n`;
                o += `echo '-w /etc/sudoers -p wa -k sudoers_changes' >> /etc/audit/rules.d/audit.rules\n`;
            }
            if (other_sec_tools.includes('fail2ban')) {
                o += `${inst(['fail2ban'])}\ncat > /etc/fail2ban/jail.local << 'F2B'\n[DEFAULT]\nbantime = 3600\nfindtime = 600\nmaxretry = 3\n[sshd]\nenabled = true\nF2B\n${svc('fail2ban')}\n`;
            }
            if (other_sec_tools.includes('ufw')) {
                o += `${inst(['ufw'])}\nufw default deny incoming\nufw default allow outgoing\n${svc('ufw')}\n`;
            }
            if (other_sec_tools.includes('lynis')) {
                o += `${inst(['lynis'])}\n# Run an initial audit and keep the report for review\nlynis audit system --quick --no-colors > /var/log/lynis-initial.log 2>&1 || true\n`;
            }
            if (other_sec_tools.includes('usbkill')) {
                // Upstream usbkill: installed but deliberately NOT enabled, because
                // it powers the machine off with no confirmation. Arming it is an
                // explicit, separate decision the user makes on the machine itself.
                o += `\n# usbkill (upstream anti-forensic kill switch)\n`;
                if (M.aur) {
                    o += `su - builder -c "paru -S --noconfirm usbkill"\n`;
                } else {
                    /* Upstream ships it on PyPI and there is no package here.
                       Installed from the source it is actually published as,
                       rather than through a package name that does not exist. */
                    o += `# No ${osLabel} package: installed from upstream, which is where it lives.\n`;
                    o += `git clone https://github.com/hephaest0s/usbkill.git /opt/usbkill\n`;
                    o += `(cd /opt/usbkill && python setup.py install)\n`;
                }
                if (effectiveSuite.includes('anti-ducky')) {
                    // One allowlist, two consumers. Two tools with two different
                    // ideas of what is trusted is how a machine powers itself
                    // off over its owner's own keyboard.
                    o += `mkdir -p /etc/motd.d\n`;
                    o += `cat > /etc/motd.d/11-usbkill << 'KILLMOTD'\n`;
                    o += `usbkill is installed but not running. After 'anti-ducky --enroll',\n`;
                    o += `hand it the same allowlist so the two cannot disagree:\n`;
                    o += `  trusted=$(sudo anti-ducky --export-whitelist | paste -sd,) && \\\n`;
                    o += `    printf '[config]\\nwhitelist = %s\\n' "$trusted" | \\\n`;
                    o += `    sudo tee /etc/usbkill/usbkill.ini\n`;
                    o += `KILLMOTD\n`;
                }
                o += `echo "usbkill installed but NOT enabled."\n`;
                o += `echo "It powers the machine off immediately when USB devices change,"\n`;
                o += `echo "with no confirmation and no chance to save work."\n`;
                o += `echo "Review /etc/usbkill/usbkill.ini, then start it manually with:"\n`;
                o += `echo "  sudo usbkill"\n`;
            }
        }

        if (auto_updates === "yes" || post_apps.includes("unattended-upgrades")) {
            if (!cmdOnly) o += `\`\`\`\n\n## 10. Auto Updates\n\`\`\`bash\n`;
            else o += `\n# 10. Auto Updates\n`;
            o += `${svc('cronie')}\n`;
            if (post_apps.includes("unattended-upgrades") && M.aur) {
                o += `su - builder -c "paru -S --noconfirm unattended-upgrades"\n`;
                o += `mkdir -p /etc/unattended-upgrades\n`;
                o += `cat << 'UPCONF' > /etc/unattended-upgrades/unattended-upgrades.conf\n`;
                o += `Unattended-Upgrade::Automatic-Reboot "true";\n`;
                o += `Unattended-Upgrade::Automatic-Reboot-Time "03:00";\n`;
                o += `UPCONF\n`;
                o += `systemctl enable --now unattended-upgrades.timer\n`;
            } else {
                if (post_apps.includes("unattended-upgrades")) {
                    o += `# unattended-upgrades is Debian's and has no ${osLabel} equivalent.\n`;
                    o += `# The cron job below does the same job with this system's own\n`;
                    o += `# package manager.\n`;
                }
                o += `cat << 'CRON_SCRIPT' > /usr/local/bin/auto-update.sh\n#!/bin/bash\n`;
                o += `echo "[$(date)] Starting full system auto-update..." >> /var/log/auto-update.log\n`;
                if (isGentoo) {
                    /* A source-based system has to fetch the tree first, and an
                       unattended world update can run for hours — so it is
                       logged the same way and the caveat is stated where the
                       reader will meet it. */
                    o += `${M.sync} >> /var/log/auto-update.log 2>&1\n`;
                    o += `${M.upgrade} >> /var/log/auto-update.log 2>&1\n`;
                    o += `# An unattended world update on a source-based system can run for\n`;
                    o += `# hours and will use every core it was told it could.\n`;
                } else {
                    o += `${M.upgrade} >> /var/log/auto-update.log 2>&1\n`;
                    o += `if id "builder" >/dev/null 2>&1 && command -v paru >/dev/null 2>&1; then\n`;
                    o += `  su - builder -c "paru -Sua --noconfirm" >> /var/log/auto-update.log 2>&1\n`;
                    o += `fi\n`;
                }
                o += `echo "[$(date)] System update complete." >> /var/log/auto-update.log\n`;
                o += `# If system is inactive (0 users logged in), reboot to apply kernel/systemd updates\n`;
                o += `if [ "$(who | wc -l)" -eq 0 ]; then\n`;
                o += `  echo "[$(date)] System inactive. Rebooting to apply updates..." >> /var/log/auto-update.log\n`;
                o += `  reboot\n`;
                o += `fi\n`;
                o += `CRON_SCRIPT\nchmod +x /usr/local/bin/auto-update.sh\n(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/auto-update.sh") | crontab -\n`;
            }
        }

        /* The cheatsheet for the system being installed, not Arch's under
           another system's name. `CHEATSHEETS` names the file per system; a
           system with no sheet of its own gets none rather than Arch's, which
           would be the same wrong-commands-under-the-wrong-heading problem in a
           file the reader keeps. */
        /* No metadata at all means nothing was selected, which resolves to Arch
           everywhere else on this page; its sheet follows. */
        const cheatFile = osMeta ? (osMeta.cheatsheet || null) : 'arch-commands.md';
        const rawBase = 'https://raw.githubusercontent.com/tilas01/Unix-SIT/main/docs/cheatsheets/';
        if (cmdOnly) {
            o += `\n# Downloading Cheatsheets\n`;
            o += `mkdir -p /home/$u1/cheatsheets\n`;
            if (cheatFile) {
                o += `curl -sL "${rawBase}${cheatFile}" -o /home/$u1/cheatsheets/${cheatFile}\n`;
            } else {
                o += `# No ${osLabel} cheatsheet is written yet, and Arch's would be wrong here.\n`;
            }
            if (desktop === 'dusky') {
                o += `curl -sL "${rawBase}duskyos-hyprland.md" -o /home/$u1/cheatsheets/duskyos-hyprland.md\n`;
            }
            o += `chown -R $u1:$u1 /home/$u1/cheatsheets\n`;
            o += emitWallpapers('/home/$u1/Pictures/wallpapers', '$u1');
        } else {
            o += `\n### 11. Download Cheatsheets\n\`\`\`bash\nmkdir -p ~/cheatsheets\n`;
            if (cheatFile) {
                o += `curl -sL "${rawBase}${cheatFile}" -o ~/cheatsheets/${cheatFile}\n`;
            } else {
                o += `# No ${osLabel} cheatsheet is written yet, and Arch's would be wrong here.\n`;
            }
            if (desktop === 'dusky') {
                o += `curl -sL "${rawBase}duskyos-hyprland.md" -o ~/cheatsheets/duskyos-hyprland.md\n`;
            }
            o += `\`\`\`\n`;
            const wpBlock = emitWallpapers('~/Pictures/wallpapers', null);
            if (wpBlock) o += `\n### 12. Wallpapers\n\`\`\`bash\n` + wpBlock + `\`\`\`\n`;
        }

        // Setup Phase 2 Script Rollover
        if (cmdOnly) {
            o += `\ncat << 'ROLLOVER' > /home/$u1/post_boot_setup.sh\n`;
            o += `#!/bin/bash\n`;
            o += `echo -e "\\e[38;2;122;162;247mWelcome to your new Arch Installation!\\e[0m"\n`;
            if (desktop === "dusky") {
                o += `echo "Please log in and run 'Hyprland' to start your desktop environment."\n`;
            }
            o += `echo "Cleaning up installer scripts..."\n`;
            o += `rm -f /home/$u1/post_boot_setup.sh\n`;
            o += `ROLLOVER\n`;
            o += `chmod +x /home/$u1/post_boot_setup.sh\n`;
            o += `chown $u1:$u1 /home/$u1/post_boot_setup.sh\n`;
            // Add execution of rollover to bashrc so it runs on first login
            o += `echo "/home/$u1/post_boot_setup.sh" >> /home/$u1/.bashrc\n`;
            
            o += `EOF\nchmod +x ${mntRoot}/chroot_script.sh\n${chrootRun('/chroot_script.sh')}\n`;
            if (cleanup === "yes") {
                if (isGentoo) {
                    /* Portage's caches are distfiles (sources) and binpkgs, in
                       different places from pacman's one package directory, and
                       eclean is the supported way to clear them without removing
                       what the installed system still refers to. */
                    o += `${chrootRun("-c 'emerge --verbose --noreplace app-portage/gentoolkit && eclean-dist --deep && eclean-pkg --deep'")}\n`;
                    o += `rm -rf ${mntRoot}/${M.pkgCache}/* ${mntRoot}/tmp/*\n`;
                } else {
                    o += `arch-chroot /mnt pacman -Scc --noconfirm\nrm -rf /mnt/var/cache/pacman/pkg/* /mnt/tmp/*\n`;
                }
            }
            o += `rm -f ${mntRoot}/chroot_script.sh\n`;
            if (configMode === 'preconfigured') {
                o += `echo -e "\\e[33m[!] WALK-AWAY AUTOMATION: Securely wiping credentials from memory...\\e[0m"\n`;
                o += `unset LUKS_PASS LUKS_PASS2 ROOT_PASS ROOT_PASS2\n`;
                for (let u = 1; u <= user_count; u++) {
                    o += `unset USER_NAME_${u} USER_PASS_${u} USER_PASS2_${u}\n`;
                }
            }
            o += `echo -e "\${COLOR_BLUE}>> INSTALL COMPLETE! You may now run 'reboot'\${COLOR_RESET}"\n`;
        } else {
            o += `\`\`\`\n\n---\n*Guide complete. Reboot into your ${desktop !== "none" ? desktop : "TTY"} environment.*\n*Generated by [*nix Install Guides](https://tilas01.github.io/Unix-SIT/) — by [tilas01](https://github.com/tilas01)*\n`;
        }


        // --- STANDALONE SECURITY APP DEPLOYMENT (LIBRE-OTP & AUTO-UPDATER) ---
        const updaterApps = [
            { id: 'libre-otp', name: 'Libre-OTP Authenticator', repo: 'libre-otp' },
            { id: 'anti-ducky', name: 'Anti-Ducky', repo: 'anti-ducky' },
            { id: 'anti-evil-maid', name: 'Anti-Evil Maid', repo: 'anti-evil-maid' },
            { id: 'kernel-watcher', name: 'Kernel Watcher (EDR)', repo: 'kernel-watcher' },
            { id: 'scarecrow', name: 'ScareCrow (LKM)', repo: 'scarecrow' }
        ];

        const selectedSecApps = updaterApps.filter(app => post_apps.includes(app.id));
        
        if (selectedSecApps.length > 0) {
            if (!cmdOnly) o += `\n\n### Secure Standalone Tools (Auto-Updater)\n\n\`\`\`bash\n`;
            else o += `\n# ==========================================\n# SECURE STANDALONE TOOLS (AUTO-UPDATER)\n# ==========================================\n`;
            
            // Write the updater daemon script once
            o += `cat << 'EOF' > /usr/local/bin/arch-guides-updater.sh\n`;
            o += `#!/bin/bash\nset -e\n`;
            o += `APP=$1\n`;
            o += `REPO="tilas01/Unix-SIT"\n`;
            o += `LATEST_URL="https://github.com/$REPO/releases/latest/download"\n`;
            o += `TEMP_DIR=$(mktemp -d)\ncd "$TEMP_DIR"\n`;
            o += `echo "Updating $APP..." >> /var/log/arch-guides-updater.log\n`;
            o += `if curl -sLf "$LATEST_URL/$APP" -o "$APP" && curl -sLf "$LATEST_URL/$APP.sha512" -o "$APP.sha512" && curl -sLf "$LATEST_URL/$APP.sig" -o "$APP.sig"; then\n`;
            o += `    if ! sha512sum -c "$APP.sha512" --status 2>/dev/null; then notify-send "Update Failed" "Hash mismatch for $APP"; exit 1; fi\n`;
            o += `    if ! gpg --verify "$APP.sig" "$APP" 2>/dev/null; then notify-send "Update Failed" "GPG Signature invalid for $APP"; exit 1; fi\n`;
            o += `    chmod +x "$APP" && cp "$APP" /usr/local/bin/$APP\n`;
            o += `else notify-send "Update Failed" "Missing GitHub assets for $APP"; fi\n`;
            o += `rm -rf "$TEMP_DIR"\nEOF\n`;
            o += `chmod +x /usr/local/bin/arch-guides-updater.sh\n\n`;

            selectedSecApps.forEach(appObj => {
                const app = appObj.id;
                o += `echo "Installing up auto-updater hook for ${app}..."\n`;
                o += `cat << 'EOF' > /usr/share/libalpm/hooks/${app}-updater.hook\n`;
                o += `[Trigger]\nOperation = Upgrade\nType = Package\nTarget = *\n\n`;
                o += `[Action]\nDescription = Checking for verified updates to ${app}...\n`;
                o += `When = PostTransaction\nExec = /usr/local/bin/arch-guides-updater.sh ${app}\n`;
                o += `Depends = curl\nDepends = gnupg\nEOF\n\n`;
            });
            
            // Check for libre-otp UI configurations
            if (post_apps.includes('libre-otp')) {
                // To get DOM elements correctly at generation time, we query them
                const otpModeEl = document.getElementById('modal_otp_mode');
                const otpDisplayEl = document.getElementById('modal_otp_display');
                const otpMode = otpModeEl ? otpModeEl.value : 'both';
                const otpDisplay = otpDisplayEl ? otpDisplayEl.value : 'discreet';
                
                o += `echo "Configuring Libre-OTP with Mode: ${otpMode}, Display: ${otpDisplay}"\n`;
                o += `mkdir -p /etc/libre-otp\n`;
                o += `echo "{\"display\": \"${otpDisplay}\", \"mode\": \"${otpMode}\"}" > /etc/libre-otp/config.json\n`;
            }
            
            // Hook for all other security apps if needed (placeholder to satisfy request)
            if (post_apps.includes('kloak')) {
                o += `cat << 'EOF' > /usr/share/libalpm/hooks/kloak-updater.hook\n`;
                o += `[Trigger]\nOperation = Upgrade\nType = Package\nTarget = *\n\n`;
                o += `[Action]\nDescription = Custom Hook for generic security apps (placeholder)\n`;
                o += `When = PostTransaction\nExec = /bin/true\nEOF\n\n`;
            }
            
            if (!cmdOnly) o += `\`\`\`\n\n`;
        }
        
        return o;
    }

    // ── Build the output ──
    let mdOutput = "", scriptOutput = "";
    if (format === "script" || format === "both") scriptOutput = buildOutput(true);
    if (format === "markdown" || format === "both") mdOutput = buildOutput(false);

    // ── Proprietary software notices appended to the guide ──
    if (selectedPropApps.length > 0) {
        if (software_type === 'libre') {
            mdOutput += `\n\n> [!CAUTION]\n> **LIBRE CONFLICT**: You selected "Fully Libre" software type, but included ` +
                `proprietary applications (${selectedPropApps.join(', ')}). Your system will NOT be fully libre!\n`;
        } else {
            let warnStr = `\n\n## ⚠️ Proprietary Software Notice\n> You have chosen to include software containing ` +
                `proprietary (closed-source) code. Be aware of the following privacy/freedom implications:\n`;
            selectedPropApps.forEach(a => { warnStr += `- **${a.toUpperCase()}**: ${propAppsDB[a]}\n`; });
            mdOutput += warnStr;
        }
    }

    // ── Hand off to the Live Editor ──
    // The generated output goes straight into the staging editor, where the user
    // can tweak it before pressing "Confirm & Save" to reach the static output
    // view. (This block used to render into a #generated-guide container that no
    // longer exists in index.html, so generation produced nothing visible.)
    const { mainSh, postSh } = splitInstallScript(scriptOutput);
    const configJSONText = configJSONString(window.getFormValues(), 'dynamic-generator');
    try { sessionStorage.setItem('last_generated_sc', configJSONText); } catch (e) { /* non-fatal */ }

    const mdBox   = document.getElementById('live-editor-textarea-md');
    const shBox   = document.getElementById('live-editor-textarea-sh');
    const postBox = document.getElementById('live-editor-textarea-post');

    if (mdBox)   mdBox.value   = (format === 'script') ? '' : mdOutput;
    if (shBox)   shBox.value   = (format === 'markdown') ? '' : mainSh;
    if (postBox) postBox.value = (format === 'markdown') ? '' : postSh;

    // Hide the post-install panel when there is nothing to put in it.
    const postWrap = document.getElementById('live-editor-post-sh-container');
    if (postWrap) postWrap.style.display = postSh.trim() ? '' : 'none';

    const liveEditorSection = document.getElementById('live-editor');
    if (liveEditorSection) liveEditorSection.style.display = 'block';

    // Keep the syntax-highlighted mirrors in step with the textareas.
    if (window.refreshLiveEditorPreviews) window.refreshLiveEditorPreviews();

    stageForLiveEditor(mdOutput, mainSh, postSh);
    buildSshDeployCommands(mainSh, postSh);
    // Say plainly which apps fell back to recommended settings.
    reportAppDefaults(defaulted);

    if (!auto) {
        saveToHistory(mdOutput, scriptOutput, format, postSh, configJSONText);
        if (liveEditorSection) {
            liveEditorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
};

// ─── USB kill switch ─────────────────────────────────────────────────────────
// A udev-driven allowlist in the spirit of the usbkill project: the allowlist is
// generated from the devices attached at install time, and anything outside it
// triggers the configured response.
//
// "lock" is offered first and recommended, because the shutdown variants will
// power the machine off the moment an unexpected device appears — including an
// ordinary keyboard or dock — and that is a good way to lose work.
function buildUsbKill(action, trigger, cmdOnly) {
    let o = '';
    const wipesRam = action === 'shutdown-wipe-ram';
    const powersOff = action === 'shutdown' || wipesRam;

    if (!cmdOnly) {
        o += `\`\`\`\n\n## USB Kill Switch\n\n`;
        o += `Builds an allowlist from the USB devices present during installation and ` +
             `watches for anything else via udev.\n\n`;
        if (powersOff) {
            o += `> [!CAUTION]\n`;
            o += `> **This powers the machine off without warning and loses unsaved work.** ` +
                 `A missing entry in the allowlist is enough to trigger it, so plugging in a ` +
                 `keyboard, mouse, dock or phone can shut the machine down mid-use. ` +
                 `Test in a virtual machine first, and prefer the "lock session" action until ` +
                 `you are confident in the allowlist.\n\n`;
        }
        if (wipesRam) {
            o += `> [!CAUTION]\n`;
            o += `> The RAM/swap wipe is an anti-forensic measure intended to defeat cold-boot ` +
                 `key recovery. It makes an unclean shutdown even less recoverable — filesystem ` +
                 `damage is possible. Only enable it if you specifically need this property.\n\n`;
        }
        o += `\`\`\`bash\n`;
    } else {
        o += `\n# ── USB kill switch ──\n`;
        if (powersOff) {
            o += `echo -e "\${COLOR_RED}[!] USB kill switch will POWER OFF this machine when an\${COLOR_RESET}"\n`;
            o += `echo -e "\${COLOR_RED}[!] unlisted USB device appears. Unsaved work will be lost.\${COLOR_RESET}"\n`;
        }
    }

    o += `${genInstall(['usbutils'])}\n`;
    o += `mkdir -p /etc/arch-security\n\n`;

    o += `# Snapshot the currently-attached USB devices as the allowlist.\n`;
    o += `lsusb | awk '{print $6}' | sort -u > /etc/arch-security/usb-allowlist\n`;
    o += `chmod 600 /etc/arch-security/usb-allowlist\n`;
    o += `echo "Allowlisted USB IDs:"; cat /etc/arch-security/usb-allowlist\n\n`;

    o += `cat > /usr/local/bin/usb-kill.sh << 'USBKILL_EOF'\n`;
    o += `#!/bin/bash\n`;
    o += `# Reacts to a USB event. Invoked by udev with ACTION and the device IDs set.\n`;
    o += `set -u\n`;
    o += `ALLOWLIST=/etc/arch-security/usb-allowlist\n`;
    o += `LOG=/var/log/usb-kill.log\n`;
    o += `[ -f "$ALLOWLIST" ] || exit 0\n\n`;
    o += `ID="\${ID_VENDOR_ID:-}:\${ID_MODEL_ID:-}"\n`;
    o += `log() { echo "[$(date -Is)] $*" >> "$LOG"; }\n\n`;
    o += `if grep -qx "$ID" "$ALLOWLIST"; then\n`;
    o += `    log "allowed device $ID (\${ACTION:-unknown})"\n`;
    o += `    exit 0\n`;
    o += `fi\n\n`;
    o += `log "UNAUTHORISED device $ID action=\${ACTION:-unknown} -- triggering response"\n\n`;

    if (action === 'lock') {
        o += `# Lock every active session. Non-destructive.\n`;
        o += `loginctl lock-sessions || true\n`;
        o += `command -v notify-send >/dev/null && notify-send -u critical \\\n`;
        o += `    "USB Kill Switch" "Unauthorised device $ID — sessions locked." || true\n`;
    } else {
        if (wipesRam) {
            o += `# Anti-forensic: drop caches and clear swap before powering off, so keys\n`;
            o += `# are less likely to survive in memory for a cold-boot attack.\n`;
            o += `sync\n`;
            o += `swapoff -a 2>/dev/null || true\n`;
            o += `echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true\n`;
        }
        o += `# Power off immediately, without the usual graceful shutdown delay.\n`;
        o += `systemctl poweroff --force --force 2>/dev/null || poweroff -f\n`;
    }
    o += `USBKILL_EOF\n`;
    o += `chmod 700 /usr/local/bin/usb-kill.sh\n\n`;

    // udev rule, matching the requested trigger.
    const wantAdd = trigger === 'new' || trigger === 'both';
    const wantRemove = trigger === 'removed' || trigger === 'both';
    o += `cat > /etc/udev/rules.d/99-usb-kill.rules << 'UDEV_EOF'\n`;
    if (wantAdd) {
        o += `ACTION=="add", SUBSYSTEM=="usb", RUN+="/usr/local/bin/usb-kill.sh"\n`;
    }
    if (wantRemove) {
        o += `ACTION=="remove", SUBSYSTEM=="usb", RUN+="/usr/local/bin/usb-kill.sh"\n`;
    }
    o += `UDEV_EOF\n`;
    o += `udevadm control --reload-rules\n\n`;

    o += `echo "USB kill switch installed (action: ${action}, trigger: ${trigger})."\n`;
    o += `echo "Edit /etc/arch-security/usb-allowlist to add devices you trust,"\n`;
    o += `echo "then run: udevadm control --reload-rules"\n`;
    o += `echo "To disable: rm /etc/udev/rules.d/99-usb-kill.rules && udevadm control --reload-rules"\n`;

    if (!cmdOnly) o += `\`\`\`\n`;
    return o;
}

// ─── LUKS duress passphrase ──────────────────────────────────────────────────
// Adds a second passphrase to the LUKS header. A tiny initramfs hook compares
// the entered passphrase against a salted hash and, on a match, performs the
// chosen response instead of unlocking the real volume.
//
// Deliberately conservative:
//   * The hash is stored, never the passphrase.
//   * "shutdown" is the default and the recommended action; nothing is erased.
//   * Any option that erases keyslots emits explicit warnings into the script
//     itself, requires a typed confirmation at setup time, and is described in
//     the generated guide as irreversible.
function buildLuksDuress(action, decoyEnv, partRoot, cmdOnly) {
    let o = '';
    const destructive = action === 'wipe-keys' || action === 'wipe-keys-decoy';
    const usesDecoy = action === 'decoy-only' || action === 'wipe-keys-decoy';

    if (!cmdOnly) {
        o += `\`\`\`\n\n### LUKS Duress Passphrase\n\n`;
        o += `A second passphrase is registered on the LUKS header. Entering it at the ` +
             `boot prompt runs the configured response instead of unlocking the disk. ` +
             `Your real passphrase keeps working exactly as before.\n\n`;
        if (destructive) {
            o += `> [!CAUTION]\n`;
            o += `> **This configuration destroys data.** Erasing the LUKS keyslots makes ` +
                 `every byte on the volume permanently unrecoverable — the correct passphrase ` +
                 `will not help afterwards, and no forensic recovery is possible. Typing the ` +
                 `duress passphrase by accident destroys the installation. Keep verified ` +
                 `offline backups and test the whole flow in a virtual machine first.\n\n`;
        }
        if (usesDecoy) {
            o += `> [!NOTE]\n`;
            o += `> The decoy environment is a separate small LUKS volume that the duress ` +
                 `passphrase unlocks. It contains no reference to the real volume, so a boot ` +
                 `into the decoy is indistinguishable from a normal boot.\n\n`;
        }
        o += `\`\`\`bash\n`;
    } else {
        o += `\n# ── LUKS duress passphrase ──\n`;
        o += `echo -e "\${COLOR_RED}[!] Configuring LUKS duress passphrase\${COLOR_RESET}"\n`;
        if (destructive) {
            o += `echo -e "\${COLOR_RED}[!] WARNING: the duress passphrase will ERASE ALL KEYSLOTS.\${COLOR_RESET}"\n`;
            o += `echo -e "\${COLOR_RED}[!] Data becomes permanently unrecoverable. Ensure you have backups.\${COLOR_RESET}"\n`;
            o += `read -p "Type DESTROY to confirm you understand this is irreversible: " _duress_ack\n`;
            o += `if [ "$_duress_ack" != "DESTROY" ]; then echo "Skipping duress setup."; DURESS_SKIP=1; fi\n`;
        }
    }

    const guard = (destructive && cmdOnly) ? `if [ -z "\${DURESS_SKIP:-}" ]; then\n` : '';
    const endGuard = (destructive && cmdOnly) ? `fi\n` : '';
    o += guard;

    // Collect the duress passphrase and register it as an extra keyslot.
    o += `read -s -p "Enter the DURESS passphrase (must differ from your real one): " DURESS_PASS\necho\n`;
    o += `read -s -p "Confirm the duress passphrase: " DURESS_PASS2\necho\n`;
    o += `[ "$DURESS_PASS" = "$DURESS_PASS2" ] || { echo "Duress passphrases did not match."; exit 1; }\n`;
    o += `[ "$DURESS_PASS" != "$LUKS_PASS" ] || { echo "Duress passphrase must differ from the real passphrase."; exit 1; }\n\n`;

    o += `# Register the duress passphrase as an additional keyslot.\n`;
    o += `printf '%s' "$DURESS_PASS" | cryptsetup luksAddKey ${partRoot} --key-file=- <<< "$LUKS_PASS"\n\n`;

    o += `# Store only a salted hash of the duress passphrase for the boot hook.\n`;
    o += `mkdir -p /mnt/etc/arch-security\n`;
    o += `DURESS_SALT=$(head -c 16 /dev/urandom | base64 -w0)\n`;
    o += `DURESS_HASH=$(printf '%s%s' "$DURESS_SALT" "$DURESS_PASS" | sha512sum | cut -d' ' -f1)\n`;
    o += `cat > /mnt/etc/arch-security/duress.conf << 'DURESS_EOF'\n`;
    o += `# Generated by *nix Install Guides. Contains no passphrase, only a hash.\n`;
    o += `ACTION=${action}\n`;
    o += `DECOY_ENV=${usesDecoy ? decoyEnv : 'none'}\n`;
    o += `DURESS_EOF\n`;
    o += `printf 'SALT=%s\\nHASH=%s\\n' "$DURESS_SALT" "$DURESS_HASH" >> /mnt/etc/arch-security/duress.conf\n`;
    o += `chmod 600 /mnt/etc/arch-security/duress.conf\n`;
    o += `unset DURESS_PASS DURESS_PASS2 DURESS_HASH DURESS_SALT\n\n`;


    if (usesDecoy) {
        o += `\n# Reminder: create the decoy volume before relying on this.\n`;
        o += `echo "NOTE: create a partition labelled 'decoy', LUKS-format it with the duress"\n`;
        o += `echo "      passphrase, and install a minimal ${decoyEnv} environment into it."\n`;
        o += `echo "      Until that exists, the duress passphrase powers the machine off."\n`;
    }

    o += endGuard;
    if (!cmdOnly) o += `\`\`\`\n`;
    return o;
}

/**
 * The initramfs half of the duress passphrase, emitted inside the new system.
 *
 * Split from `buildLuksDuress()` because the two halves belong at different
 * points in the install and putting them together made the whole script fail.
 * Registering the extra keyslot has to happen where the volume is open and the
 * real passphrase is still in a variable — that is during partitioning, before
 * anything is installed. Writing the boot hook has to happen after the base
 * system exists: `/etc/initcpio/hooks/` is a directory the base install
 * creates, so writing into it beforehand fails outright, and the initramfs
 * cannot be built inside an empty root.
 *
 * `duress` is inserted into HOOKS by the caller rather than by a second `sed`,
 * and the caller's own initramfs rebuild covers it, so this writes files and
 * nothing else.
 */
function buildDuressHook(action, decoyEnv, partRoot) {
    /* Read from the same option values `buildLuksDuress()` reads. Two copies of
       this mapping that disagree would arm one half of the response and not the
       other, which on the erase path means a passphrase that destroys the
       keyslots and then unlocks nothing to boot into. */
    const destructive = action === 'wipe-keys' || action === 'wipe-keys-decoy';
    const usesDecoy = action === 'decoy-only' || action === 'wipe-keys-decoy';
    let o = '';

    /* The body of the hook: what it does when the passphrase is entered. Held
       as lines because the two initramfs generators disagree about the wrapper
       around it and about nothing inside it — and this one especially must not
       drift, because a duress passphrase that has quietly stopped being checked
       is worse than never having had one. */
    const body = [];
    body.push(`    [ -f /etc/arch-security/duress.conf ] || return 0`);
    body.push(`    . /etc/arch-security/duress.conf`);
    body.push(`    printf 'Enter passphrase: '`);
    body.push(`    read -s _pw; echo`);
    body.push(`    _try=$(printf '%s%s' "$SALT" "$_pw" | sha512sum | cut -d' ' -f1)`);
    body.push(`    if [ "$_try" != "$HASH" ]; then`);
    body.push(`        # Not the duress passphrase: hand it to the normal unlock path.`);
    body.push(`        printf '%s' "$_pw" > /crypto_keyfile.bin`);
    body.push(`        unset _pw _try`);
    body.push(`        return 0`);
    body.push(`    fi`);
    body.push(`    unset _pw _try`);
    if (destructive) {
        body.push(`    # Duress: erase every keyslot. This is irreversible.`);
        body.push(`    cryptsetup erase --batch-mode ${partRoot} >/dev/null 2>&1`);
        body.push(`    # Overwrite the header area as a second line of defence.`);
        body.push(`    dd if=/dev/urandom of=${partRoot} bs=1M count=32 conv=fsync >/dev/null 2>&1`);
    }
    if (usesDecoy) {
        body.push(`    # Boot the decoy volume. It has no reference to the real volume.`);
        body.push(`    if cryptsetup open --key-file=- /dev/disk/by-partlabel/decoy decoyroot; then`);
        body.push(`        mount /dev/mapper/decoyroot /new_root 2>/dev/null && return 0`);
        body.push(`    fi`);
        body.push(`    # Decoy unavailable: fall back to powering off rather than revealing anything.`);
        body.push(`    poweroff -f`);
    } else {
        body.push(`    # No decoy configured: power off immediately.`);
        body.push(`    poweroff -f`);
    }

    o += `\n# Duress passphrase: the boot hook that compares what was typed.\n`;
    if (genOs.gentoo) {
        /* Dracut's shape. `cmdline` runs before the volume is opened, which is
           the position `encrypt` occupies on the other side, and `return 0`
           becomes `exit 0` because the body is a script rather than a
           function. */
        o += `mkdir -p /usr/lib/dracut/modules.d/90duress\n`;
        o += `cat > /usr/lib/dracut/modules.d/90duress/duress.sh << 'HOOK_EOF'\n`;
        o += `#!/bin/sh\n`;
        body.forEach(l => { o += `${l.replace(/^ {4}/, '').replace(/\breturn 0\b/, 'exit 0')}\n`; });
        o += `HOOK_EOF\n`;
        o += `chmod 755 /usr/lib/dracut/modules.d/90duress/duress.sh\n`;
        o += `cat > /usr/lib/dracut/modules.d/90duress/module-setup.sh << 'INST_EOF'\n`;
        o += `#!/bin/bash\n`;
        o += `check() { return 0; }\n`;
        o += `depends() { echo crypt; }\n`;
        o += `install() {\n`;
        o += `    inst_multiple cryptsetup sha512sum dd\n`;
        o += `    inst_simple /etc/arch-security/duress.conf\n`;
        o += `    inst_hook cmdline 20 "$moddir/duress.sh"\n`;
        o += `}\n`;
        o += `INST_EOF\n`;
        o += `chmod 755 /usr/lib/dracut/modules.d/90duress/module-setup.sh\n`;
        o += `mkdir -p /etc/dracut.conf.d\n`;
        o += `echo 'add_dracutmodules+=" duress "' >> /etc/dracut.conf.d/duress.conf\n`;
    } else {
        o += `mkdir -p /etc/initcpio/hooks /etc/initcpio/install\n`;
        o += `cat > /etc/initcpio/hooks/duress << 'HOOK_EOF'\n`;
        o += `#!/usr/bin/ash\n`;
        o += `run_hook() {\n`;
        body.forEach(l => { o += `${l}\n`; });
        o += `}\n`;
        o += `HOOK_EOF\n`;
        o += `chmod 755 /etc/initcpio/hooks/duress\n`;
        o += `cat > /etc/initcpio/install/duress << 'INST_EOF'\n`;
        o += `#!/bin/bash\n`;
        o += `build() {\n`;
        o += `    add_runscript\n`;
        o += `    add_binary cryptsetup\n`;
        o += `    add_binary sha512sum\n`;
        o += `    add_binary dd\n`;
        o += `    add_file /etc/arch-security/duress.conf\n`;
        o += `}\n`;
        o += `help() { echo "Handles the LUKS duress passphrase."; }\n`;
        o += `INST_EOF\n`;
        o += `chmod 755 /etc/initcpio/install/duress\n`;
    }
    return o;
}

// Builds the copy-paste SSH one-liners shown on the static output page.
function buildSshDeployCommands(mainSh, postSh) {
    const container = document.getElementById('ssh-commands-container');
    if (!container) return;

    const heredoc = (label, filename, body, colour) => `
        <div>
            <p style="color:var(--fg-color); margin:0 0 0.3rem; font-size:0.85rem;"><strong>${escapeHTML(label)}</strong></p>
            <pre class="output-box oneliner" style="border-color:${colour};"><code class="language-bash">${escapeHTML(
                `ssh root@<TARGET-IP> "cat > /root/${filename}" << 'ARCHEOF'\n${body}\nARCHEOF\n` +
                `ssh root@<TARGET-IP> "bash /root/${filename}"`
            )}</code></pre>
        </div>`;

    let out = '';
    if (mainSh && mainSh.trim()) {
        out += heredoc('Install script', 'install.sh', mainSh, 'var(--accent-green)');
    }
    if (postSh && postSh.trim()) {
        out += heredoc('Post-install script (run after first boot)', 'post_install.sh', postSh, 'var(--accent-blue)');
    }
    container.innerHTML = out || '<p style="color:var(--fg-color); opacity:0.7;">Generate a script to see the deploy command.</p>';
    // highlight.js ships with the site rather than coming from a CDN, but keep
    // the guard: a page that fails to load it should render plain code, not
    // throw and lose the whole handler.
    if (typeof window.highlightAll === 'function') {
        window.highlightAll(container);
    }
}

// ── Form Serialization & Preview Logic ──
window.getFormValues = function() {
    const data = {
        version: 2,
        generator: CONFIG_GENERATOR,
        schema: CONFIG_SCHEMA,
        selects: {},
        inputs: {},
        checkboxes: {}
    };
    document.querySelectorAll('.generator-form select').forEach(el => data.selects[el.id] = el.value);
    document.querySelectorAll('#install-form input[type="text"], #install-form input[type="number"]').forEach(el => data.inputs[el.id] = el.value);
    document.querySelectorAll('#install-form input[type="checkbox"]').forEach(el => {
        if (!data.checkboxes[el.name]) data.checkboxes[el.name] = [];
        if (el.checked) data.checkboxes[el.name].push(el.value);
    });
    return data;
};

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('install-form');
    if (form) {
        form.addEventListener('change', () => {
            const pre = document.getElementById('sc-preview-json');
            if(pre) pre.textContent = JSON.stringify(window.getFormValues(), null, 2);
        });
        /* Re-run the cross-field checks whenever anything changes. They used to
           run only at load and after restoring a config, so a control that
           reveals another one — the dual-boot ESP fields — stayed hidden until
           the page was reloaded. */
        const dualSel = document.getElementById('dualboot');
        if (dualSel) dualSel.addEventListener('change', validateConfigurations);
        // Initial populate
        const pre = document.getElementById('sc-preview-json');
        if(pre) pre.textContent = JSON.stringify(window.getFormValues(), null, 2);
    }

    // Post-quantum overlay is experimental; only warn once it is actually chosen.
    const pqSelect = document.getElementById('encryption_pq');
    if (pqSelect) {
        const syncPq = () => {
            const warn = document.getElementById('pq-warn');
            if (warn) warn.style.display = pqSelect.value === 'none' ? 'none' : 'block';
        };
        pqSelect.addEventListener('change', syncPq);
        syncPq();
    }

    /* Dusky is chosen in one place — the desktop question — and the note
       beneath it explains what that decides for you. There used to be a
       separate yes/no here that ticked a post-install checkbox and rewrote
       the desktop select, which meant three controls held one answer. */
    const desktopSelectForDusky = document.getElementById('desktop');
    if (desktopSelectForDusky) {
        const syncDuskyNote = () => {
            const note = document.getElementById('dusky-note');
            if (note) note.style.display = desktopSelectForDusky.value === 'dusky' ? 'block' : 'none';
        };
        desktopSelectForDusky.addEventListener('change', syncDuskyNote);
        syncDuskyNote();
    }

    // ── USB kill switch: show the trigger picker and warning when armed. ──
    const usbKillSelect = document.getElementById('usb_kill');
    if (usbKillSelect) {
        const syncUsbKillUI = () => {
            const detail = document.getElementById('usb-kill-detail');
            if (detail) detail.style.display = usbKillSelect.value === 'none' ? 'none' : 'block';
        };
        usbKillSelect.addEventListener('change', syncUsbKillUI);
        syncUsbKillUI();
    }

    // ── LUKS duress: reveal the decoy picker and the data-loss warning only
    // when the chosen action actually needs them. ──
    const duressSelect = document.getElementById('luks_duress_action');
    if (duressSelect) {
        const syncDuressUI = () => {
            const action = duressSelect.value;
            const destructive = action === 'wipe-keys' || action === 'wipe-keys-decoy';
            const usesDecoy = action === 'decoy-only' || action === 'wipe-keys-decoy';

            const detail = document.getElementById('luks-duress-detail');
            const warning = document.getElementById('luks-duress-warning');
            if (detail) detail.style.display = usesDecoy ? 'block' : 'none';
            if (warning) warning.style.display = destructive ? 'block' : 'none';

            // A duress passphrase is meaningless on an unencrypted volume.
            const part = document.getElementById('partitioning');
            if (part && part.value === 'unencrypted' && action !== 'none') {
                alert('A LUKS duress passphrase needs an encrypted volume. ' +
                      'Choose LUKS1, LUKS2 or LVM on LUKS2 first.');
                duressSelect.value = 'none';
                syncDuressUI();
            }
        };
        duressSelect.addEventListener('change', syncDuressUI);
        const partSelect = document.getElementById('partitioning');
        if (partSelect) partSelect.addEventListener('change', syncDuressUI);
        syncDuressUI();
    }

    // Libre OTP sub-options are only relevant when the tool itself is selected.
    const libreOtpCb = document.querySelector('input[name="post_apps"][value="libre-otp"]');
    const libreOtpContainer = document.getElementById('libre-otp-options');
    if (libreOtpCb && libreOtpContainer) {
        const syncOtpOptions = () => {
            libreOtpContainer.style.display = libreOtpCb.checked ? 'block' : 'none';
        };
        libreOtpCb.addEventListener('change', syncOtpOptions);
        syncOtpOptions();
    }

    // ── All-in-One Suite: mutually exclusive with the individual tools ──
    // The suite binary links all five in, so having both selected would install
    // the same code twice. Ticking the suite disables the individual boxes and
    // explains why; unticking restores individual choice.
    const suiteBox = document.getElementById('suite_all_in_one');
    if (suiteBox) {
        const syncSuiteLock = () => {
            const locked = suiteBox.checked;
            const note = document.getElementById('suite-lock-note');
            const explain = 'Included in the All-in-One Suite, which is currently selected. ' +
                'The suite binary already contains this tool — untick the suite above to ' +
                'select tools individually.';

            TILAS_TOOL_VALUES.forEach(v => {
                const cb = document.querySelector(`input[name="post_apps"][value="${v}"]`);
                if (!cb) return;
                const card = cb.closest('label');

                if (locked) {
                    // Untick before disabling: the generator reads :checked and
                    // would otherwise still see a disabled box as selected and
                    // install the tool twice.
                    if (cb.checked) {
                        cb.checked = false;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    cb.disabled = true;
                    if (card) {
                        card.classList.add('app-disabled', 'nav-tooltip');
                        card.setAttribute('data-title', '📦 Provided by the Suite');
                        card.setAttribute('data-desc', explain);
                    }
                } else {
                    cb.disabled = false;
                    if (card) {
                        card.classList.remove('app-disabled');
                        card.removeAttribute('data-title');
                        card.removeAttribute('data-desc');
                    }
                }
            });

            if (note) note.style.display = locked ? 'block' : 'none';

            // The group select-all would fight the lock, so disable it too.
            const enableAllBtn = document.querySelector('.my-tools-enable-btn');
            if (enableAllBtn) {
                enableAllBtn.disabled = locked;
                enableAllBtn.style.opacity = locked ? '0.45' : '';
                enableAllBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
                enableAllBtn.title = locked
                    ? 'The All-in-One Suite already includes every tool.'
                    : '';
            }

            if (window.refreshTooltips) window.refreshTooltips();
        };
        suiteBox.addEventListener('change', syncSuiteLock);
        syncSuiteLock();
    }

    // Silent tamper check vs interactive 2FA: swap the explanation to match.
    const otpModeSelect = document.getElementById('libre_otp_mode');
    if (otpModeSelect) {
        const syncOtpMode = () => {
            const silent = otpModeSelect.value === 'tamper-check';
            const tamperNote = document.getElementById('otp-tamper-note');
            const interactiveNote = document.getElementById('otp-interactive-note');
            if (tamperNote) tamperNote.style.display = silent ? 'block' : 'none';
            if (interactiveNote) interactiveNote.style.display = silent ? 'none' : 'block';
        };
        otpModeSelect.addEventListener('change', syncOtpMode);
        syncOtpMode();
    }

    // Modal Config State
    const hiddenStateHtml = `
        <input type="hidden" id="adv_doas_mode" value="both">
        <input type="hidden" id="adv_snapper_mode" value="default">
        <input type="hidden" id="adv_aem_mode" value="1">
        <input type="hidden" id="adv_theme_mode" value="tokyonight">
    `;
    // "generator-form" is a CLASS, not an id, so getElementById returned null
    // here and this whole DOMContentLoaded handler threw -- taking the
    // .btn-configure wiring, the proprietary highlighting and the .sc upload
    // listener down with it. Append into the actual <form> so these hidden
    // fields are also picked up by getFormValues() for the .sc export.
    const advHost = document.getElementById('install-form');
    if (advHost && !document.getElementById('adv_doas_mode')) {
        advHost.insertAdjacentHTML('beforeend', hiddenStateHtml);
    }

    function updateConfigButtons() {
        const doasChecked = document.querySelector('input[name="post_apps"][value="doas"]')?.checked;
        const snapperChecked = document.querySelector('input[name="post_apps"][value="snapper"]')?.checked;
        const aemChecked = document.querySelector('input[name="post_apps"][value="anti-evil-maid"]')?.checked;

        const btnDoas = document.querySelector('.btn-configure[data-app="doas"]');
        const btnSnapper = document.querySelector('.btn-configure[data-app="snapper"]');
        const btnAem = document.querySelector('.btn-configure[data-app="aem"]');

        if (btnDoas) btnDoas.style.display = doasChecked ? 'inline-block' : 'none';
        if (btnSnapper) btnSnapper.style.display = snapperChecked ? 'inline-block' : 'none';
        if (btnAem) btnAem.style.display = aemChecked ? 'inline-block' : 'none';
    }

    document.querySelectorAll('input[name="post_apps"]').forEach(cb => {
        cb.addEventListener('change', updateConfigButtons);
    });
    updateConfigButtons();

    // Modal Logic
    const modal = document.getElementById('app-config-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const modalContent = document.getElementById('modal-content-area');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveModalBtn = document.getElementById('save-modal-btn');
    let currentConfigApp = null;

    document.querySelectorAll('.btn-configure').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentConfigApp = btn.getAttribute('data-app');
            modal.style.display = 'flex';
            
            if (currentConfigApp === 'doas') {
                modalTitle.innerHTML = '⚙️ Configure Doas Wrapper';
                modalDesc.innerHTML = 'Doas Integration Mode. Replace sudo completely or keep both. <a href="wiki.html#advanced-config-doas" target="_blank" style="color:var(--accent-purple);">Wiki Help</a>';
                const currentVal = document.getElementById('adv_doas_mode').value;
                modalContent.innerHTML = `
                    <select id="temp_doas_mode" style="padding:0.5rem; background:var(--bg-color); color:var(--text-color); border:1px solid var(--border-color); border-radius:4px;">
                        <option value="both" ${currentVal==='both'?'selected':''}>Keep Sudo intact alongside Doas</option>
                        <option value="replace" ${currentVal==='replace'?'selected':''}>Fully replace Sudo with Doas wrapper (Symlink)</option>
                        <option value="remove" ${currentVal==='remove'?'selected':''}>Remove Sudo entirely</option>
                    </select>
                `;
            } else if (currentConfigApp === 'snapper') {
                modalTitle.innerHTML = '⚙️ Configure Snapper';
                modalDesc.innerHTML = 'Snapper Timeline Mode. Set how often BTRFS snapshots occur. <a href="wiki.html#advanced-config-snapper" target="_blank" style="color:var(--accent-purple);">Wiki Help</a>';
                const currentVal = document.getElementById('adv_snapper_mode').value;
                modalContent.innerHTML = `
                    <select id="temp_snapper_mode" style="padding:0.5rem; background:var(--bg-color); color:var(--text-color); border:1px solid var(--border-color); border-radius:4px;">
                        <option value="default" ${currentVal==='default'?'selected':''}>Pre/Post Transaction Snapshots Only</option>
                        <option value="timeline" ${currentVal==='timeline'?'selected':''}>Enable Hourly/Daily Timeline Automations</option>
                    </select>
                `;
            } else if (currentConfigApp === 'aem') {
                modalTitle.innerHTML = '⚙️ Configure Anti-Evil Maid';
                modalDesc.innerHTML = 'AEM Decoy Count. Increase for maximum paranoia but slower boot times. <a href="wiki.html#advanced-config-aem" target="_blank" style="color:var(--accent-purple);">Wiki Help</a>';
                const currentVal = document.getElementById('adv_aem_mode').value;
                modalContent.innerHTML = `
                    <select id="temp_aem_mode" style="padding:0.5rem; background:var(--bg-color); color:var(--text-color); border:1px solid var(--border-color); border-radius:4px;">
                        <option value="1" ${currentVal==='1'?'selected':''}>1 Decoy Image (Standard)</option>
                        <option value="2" ${currentVal==='2'?'selected':''}>2 Decoy Images</option>
                        <option value="3" ${currentVal==='3'?'selected':''}>3 Decoy Images (Paranoid)</option>
                    </select>
                `;
            }
        });
    });

    closeModalBtn?.addEventListener('click', () => modal.style.display = 'none');
    saveModalBtn?.addEventListener('click', () => {
        if (currentConfigApp === 'doas') {
            document.getElementById('adv_doas_mode').value = document.getElementById('temp_doas_mode').value;
        } else if (currentConfigApp === 'snapper') {
            document.getElementById('adv_snapper_mode').value = document.getElementById('temp_snapper_mode').value;
        } else if (currentConfigApp === 'aem') {
            document.getElementById('adv_aem_mode').value = document.getElementById('temp_aem_mode').value;
        }
        modal.style.display = 'none';
    });

    // ── Proprietary software: highlight, or hard-disable when enforcing ──
    // Two distinct behaviours, as requested:
    //   policy OFF  -> apps stay selectable, name shown in red, plain reminder.
    //   policy ON    -> apps are greyed out, unticked and unclickable, with a
    //                   tooltip on each explaining that the libre policy did it.
    const softwareTypeSelect = document.getElementById('software_type');
    const librePolicyToggle = document.getElementById('libre_policy_toggle');

    const ENFORCE_MSG = 'Disabled by the 100% Libre Software Policy. This app contains ' +
        'proprietary code. Untick "Enforce 100% Libre Software Policy" above to allow it.';

    function updateProprietaryHighlighting() {
        // "Enforced" means either the explicit policy toggle, or picking the
        // strictly-libre software type.
        const enforced = !!(librePolicyToggle && librePolicyToggle.checked);
        const libreType = softwareTypeSelect && softwareTypeSelect.value === 'libre';

        Object.keys(PROPRIETARY_APPS).forEach(val => {
            const cb = document.querySelector(`input[name="post_apps"][value="${val}"]`);
            if (!cb) return;
            const card = cb.closest('label');
            const link = card ? card.querySelector('a') : null;

            if (enforced) {
                // Untick first so a disabled box can't smuggle a selection through.
                if (cb.checked) {
                    cb.checked = false;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
                cb.disabled = true;
                if (card) {
                    card.classList.add('app-disabled');
                    card.classList.add('nav-tooltip');
                    card.setAttribute('data-title', '🔒 Blocked by Libre Policy');
                    card.setAttribute('data-desc', ENFORCE_MSG);
                }
            } else {
                cb.disabled = false;
                if (card) {
                    card.classList.remove('app-disabled');
                    card.removeAttribute('data-title');
                    card.removeAttribute('data-desc');
                }
            }

            // Red name whenever it is proprietary and the user leans libre.
            if (link) link.style.color = (libreType || enforced) ? 'var(--accent-red)' : '';
        });

        // Swap the two explanatory paragraphs.
        const reminder = document.getElementById('prop-reminder');
        const enforcedNote = document.getElementById('prop-enforced');
        if (reminder) reminder.style.display = enforced ? 'none' : '';
        if (enforcedNote) enforcedNote.style.display = enforced ? '' : 'none';

        if (window.refreshTooltips) window.refreshTooltips();
    }

    if (softwareTypeSelect) softwareTypeSelect.addEventListener('change', updateProprietaryHighlighting);
    if (librePolicyToggle) librePolicyToggle.addEventListener('change', updateProprietaryHighlighting);
    updateProprietaryHighlighting();

    // NOTE: the old "Full Suite" toggle was removed together with the
    // monolithic arch-rusty-security-suite binary. Each tool is now built and
    // configured individually; "Enable All Suite" (enableAllTilas) replaces it.

    // Proprietary App Warnings UI
    document.querySelectorAll('input[name="post_apps"]').forEach(cb => {
        if (PROPRIETARY_APPS[cb.value]) {
            const warningSpan = document.createElement('span');
            warningSpan.className = 'prop-warning nav-tooltip';
            warningSpan.setAttribute('data-title', '⚠️ Proprietary Software');
            warningSpan.setAttribute('data-desc', PROPRIETARY_APPS[cb.value]);
            warningSpan.innerHTML = ' <span style="color:var(--accent-red); cursor:help;">⚠️</span>';
            // Insert after the icon
            const iconSpan = cb.parentElement.querySelector('.app-icon');
            if (iconSpan) {
                iconSpan.insertAdjacentElement('afterend', warningSpan);
            }
        }
    });

    // Handle config upload (.json, and the legacy .sc)
    const scInput = document.getElementById('upload-sc-input');
    if (scInput) {
        scInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    // Accept both the generator's own export and the manual
                    // walkthrough's, which nests the answers one level down.
                    if (!isKnownConfigEnvelope(data)) {
                        throw new Error(
                            "This is valid JSON, but it is not a Unix-SIT config: " +
                            "it has no \"generator\" or \"schema\" field this site recognises.");
                    }
                    
                    // Restore Selects.
                    // Applied in two passes: set every value first, then fire the
                    // change events. Otherwise a handler could run against a
                    // half-restored form (Dusky reading a desktop value that has
                    // not been set yet) and force the wrong answer.
                    if (data.selects) {
                        for (const [id, val] of Object.entries(data.selects)) {
                            const el = document.getElementById(id);
                            if (el) el.value = val;
                        }
                        for (const id of Object.keys(data.selects)) {
                            const el = document.getElementById(id);
                            if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                    // Restore Inputs
                    if (data.inputs) {
                        for (const [id, val] of Object.entries(data.inputs)) {
                            const el = document.getElementById(id);
                            if (el) el.value = val;
                        }
                    }
                    // Restore Checkboxes
                    if (data.checkboxes) {
                        document.querySelectorAll('#install-form input[type="checkbox"]').forEach(cb => cb.checked = false);
                        for (const [name, vals] of Object.entries(data.checkboxes)) {
                            vals.forEach(v => {
                                const cb = document.querySelector(`input[name="${name}"][value="${v}"]`);
                                if (cb) cb.checked = true;
                            });
                        }
                    }
                    // Trigger UI updates
                    document.querySelectorAll('.generator-form select').forEach(sel => sel.dispatchEvent(new Event('change')));
                    document.querySelectorAll('#install-form input[type="checkbox"]').forEach(cb => cb.dispatchEvent(new Event('change')));
                    alert('Configuration restored successfully.');
                } catch (err) {
                    // Say what actually went wrong. "Is it valid JSON?" was
                    // unhelpful when the file was valid JSON of the wrong shape.
                    alert('Could not load that config file.\n\n' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }
});

// ====================================================================
// UI EVENT HANDLERS
// ====================================================================

/* The placeholder option is injected once, near the top of this file, and
   deliberately not here.

   A second injector used to sit at this point doing the same job carelessly:
   it removed whatever empty option was already present and inserted its own
   with `selected` set unconditionally, which discarded the default declared in
   the markup for twenty-five dropdowns. It registered later, so it ran later
   and won. The visible result was that every select on the form read empty at
   load - locale, keymap, dual boot, the five Gentoo questions, the duress
   action, the wallpaper count - and each had to be answered by hand even where
   the markup had already answered it.

   The surviving injector skips a select that already has an empty option and
   claims the selection only when the markup declared no default, which is what
   was intended all along. It attaches the same interaction cleanup, so nothing
   was lost with the duplicate. */
// Generation is triggered by the form's submit event (see the onsubmit on
// #install-form), which covers both clicking the button and pressing Enter in
// any field. There is deliberately no separate click handler here: one would
// double-fire alongside submit, and there used to be a second full copy of the
// validation logic in exactly that place, disagreeing with generateOutput().
//
// Fallback only: if the button somehow sits outside a form, wire it directly.
const generateBtn = document.getElementById('generate-btn');
if (generateBtn && !generateBtn.form) {
    generateBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.generateOutput(false);
    });
}

// ── Tooltip toggle (emoji button, always-enabled) ──
let tooltipsEnabled = sessionStorage.getItem('tooltips_enabled') !== 'false';
const tooltipToggleBtn = document.getElementById('toggle-tooltips-btn');

function syncTooltipBtn() {
    if (!tooltipToggleBtn) return;
    const on = window.tooltipsEnabled !== false;
    tooltipToggleBtn.classList.toggle('disabled', !on);
    tooltipToggleBtn.setAttribute('aria-pressed', String(on));
    tooltipToggleBtn.setAttribute('data-title', on ? 'ℹ️ Tooltips: ON' : 'ℹ️ Tooltips: OFF');
    tooltipToggleBtn.setAttribute('data-desc', on
        ? 'Tooltips are ON. Hover on desktop, or tap on mobile, for an explanation of any control. Click to turn them off — this button keeps its own tooltip either way.'
        : 'Tooltips are OFF everywhere else. This button keeps its own tooltip so you can always find your way back. Click to turn them on again.');
}

/* The click handler lives in shared-ui.js now, so the switch works on every
   page rather than only this one. Binding a second handler to the same button
   here would toggle it twice per click and leave it apparently dead, so this
   only keeps the button's appearance in step on first paint — shared-ui.js
   marks the element once it has wired it. */
if (tooltipToggleBtn && !tooltipToggleBtn.hasAttribute('data-tt-wired')) {
    syncTooltipBtn();
    tooltipToggleBtn.setAttribute('data-tt-wired', '1');
    tooltipToggleBtn.addEventListener('click', () => {
        const nowOn = window.tooltipsEnabled === false;
        if (window.setTooltipsEnabled) window.setTooltipsEnabled(nowOn);
        else { window.tooltipsEnabled = nowOn; sessionStorage.setItem('tooltips_enabled', String(nowOn)); }
        syncTooltipBtn();
    });
}

// wiki map kept for parity (used by unified tooltip.js)
const wikiMap = {
    'Firmware Selection':           '?page=architecture.md',
    'File System Features':         '?page=02-partitioning/luks2.md',
    'Target Installation Disk':     '?page=01-pre-installation.md',
    'Encryption Options':           '?page=02-partitioning/luks2.md',
    'Init System':                  '?page=03-base-installation.md',
    'Bootloader Choice':            '?page=04-bootloaders/uki-no-grub.md',
    'Main Kernel':                  '?page=maintenance.md',
    'Backup Kernel':                '?page=maintenance.md',
    'CPU Architecture':             '?page=03-base-installation.md',
    'GPU Hardware':                 '?page=03-base-installation.md',
    'Virtual Machine Guest Setup':  '?page=03-base-installation.md',
    'Software Type & Graphics Drivers': '?page=10-generator-selections-and-dusky.md',
    'Swap File Size':               '?page=02-partitioning/luks2.md',
    'Post-Install Apps & Scripts':  '?page=10-generator-selections-and-dusky.md',
    'Automatic System Updates':     '?page=07-post-installation.md',
    'Multi-User Setup':             '?page=10-generator-selections-and-dusky.md',
    'System Cleanup':               '?page=07-post-installation.md',
    'Desktop Environment':          '?page=07-post-installation.md',
    'DNS Caching':                  '?page=07-post-installation.md',
    'Display Server':               '?page=xorg-vs-wayland.md',
    // These three pointed at ?page=security-suite.md, which does not exist and
    // never has — so right-clicking any of them landed on a "could not load"
    // rather than the explanation asked for. The wiki has real sections for all
    // three; use those. tests/markdown-render.mjs now fails if a ?page= target
    // names a document that is not in website/docs/.
    '🦀 Arch Rusty Security Suite': '#security-suite',
    'Anti-Evil Maid Decoys':        '#security-suite',
    'Other Security Tools':         '#other-sec',
};
// Note: updateInfoPanel sidebar removed — unified tooltip.js handles all tooltips

// Back to generator button
const backToGenBtn = document.getElementById('back-to-gen-btn');
if (backToGenBtn) backToGenBtn.addEventListener('click', window.returnToGenerator);

// Clear output button (far right of output bar)
const clearOutputBtn = document.getElementById('clear-output-btn');
if (clearOutputBtn) clearOutputBtn.addEventListener('click', window.clearGeneratedOutput);


// ⬇️ Custom scripts toggle ⬇️
const customScriptsSelect = document.getElementById('use-custom-scripts');
const customScriptsContainer = document.getElementById('custom-scripts-container');
if (customScriptsSelect && customScriptsContainer) {
    customScriptsSelect.addEventListener('change', () => {
        customScriptsContainer.style.display = customScriptsSelect.value === 'yes' ? 'block' : 'none';
    });
}



// ⬇️ Smart Analysis ⬇️
window.smartAnalysisWarnings = [];
function validateConfigurations() {
    const fw = document.getElementById('firmware')?.value || 'uefi';
    const bootloader = document.getElementById('bootloader');
    const part = document.getElementById('partitioning');

    /* The ESP questions only mean anything when another system is staying.
       Done before the early return below, so it still works on a page where the
       bootloader or partitioning controls are absent. */
    const dualSel = document.getElementById('dualboot');
    const espGroup = document.getElementById('dualboot-esp-group');
    if (dualSel && espGroup) {
        const dual = dualSel.value && dualSel.value !== 'none';
        espGroup.hidden = !dual;
        const espPath = document.getElementById('dualboot_esp');
        // Required only while it is on screen, or the form cannot be submitted
        // for a whole-disk install.
        if (espPath) espPath.required = !!dual;

        /* Order, ownership and the default entry travel with it. Kept beside
           the ESP question rather than in their own handler so there is one
           place that decides what "dual boot is on" reveals. */
        ['dualboot-order-group', 'dualboot-owner-group', 'dualboot-default-group']
            .forEach(function (id) {
                const g = document.getElementById(id);
                if (g) g.hidden = !dual;
            });

        /* Installing first means there is nothing to share yet: the other
           system's EFI partition does not exist, so the only honest answer is
           this system's own. The control is set and disabled rather than left
           offering a choice that cannot be carried out. */
        const espMode = document.getElementById('dualboot_esp_mode');
        const order = document.getElementById('dualboot_order');
        const ownerSel = document.getElementById('dualboot_owner');
        if (dual && order && order.value === 'first') {
            if (espMode) {
                espMode.value = 'separate';
                Array.from(espMode.options).forEach(function (o) {
                    o.disabled = o.value === 'share';
                });
            }
            if (ownerSel) {
                ownerSel.value = 'this';
                Array.from(ownerSel.options).forEach(function (o) {
                    o.disabled = o.value === 'existing';
                });
            }
        } else {
            if (espMode) Array.from(espMode.options).forEach(function (o) { o.disabled = false; });
            if (ownerSel) Array.from(ownerSel.options).forEach(function (o) { o.disabled = false; });
        }
    }

    if (!bootloader || !part) return;

    if (fw === 'bios') {
        Array.from(bootloader.options).forEach(opt => {
            const bad = opt.value.includes('uki') || opt.value === 'systemd-boot';
            opt.disabled = bad;
        });
        if (bootloader.value !== 'grub') bootloader.value = 'grub';
        Array.from(part.options).forEach(opt => { opt.disabled = opt.value === 'luks2'; });
        if (part.value === 'luks2') part.value = 'luks1';
    } else {
        Array.from(bootloader.options).forEach(opt => opt.disabled = false);
        Array.from(part.options).forEach(opt => opt.disabled = false);
    }

    const warnings = [];
    const gpuBrand = document.getElementById('gpu_brand')?.value || 'amd';
    const softwareType = document.getElementById('software_type')?.value || 'libre';
    const desktop = document.getElementById('desktop')?.value || 'none';
    const displayServer = document.getElementById('display_server')?.value || 'auto';

    // ── Desktops that decide the display server for you ──────────────────────
    // Two of these are not preferences. Hyprland (and therefore Dusky) has no
    // Xorg backend; dwm has no Wayland one. Rather than let the pair be set to
    // something impossible and then correct it behind an alert() — which fired
    // on every keystroke that re-ran validation, and once contradicted itself
    // by forcing Dusky to Wayland and then warning that Wayland breaks it —
    // pin the select and say why, the same way the *nix Install Walkthrough locks it.
    const displayServerSelect = document.getElementById('display_server');
    const DS_REQUIRED = { dusky: 'wayland', hyprland: 'wayland', dwm: 'xorg' };
    const dsForced = DS_REQUIRED[desktop] || null;

    if (displayServerSelect) {
        if (dsForced) {
            if (displayServerSelect.value !== dsForced) displayServerSelect.value = dsForced;
            // Disabled, not hidden: the answer stays visible, and .value still
            // reads back for generation.
            displayServerSelect.disabled = true;
            displayServerSelect.title = desktop + ' only runs on ' +
                (dsForced === 'wayland' ? 'Wayland' : 'Xorg') + ', so this is fixed.';
        } else {
            displayServerSelect.disabled = false;
            displayServerSelect.title = '';
        }
    }
    /* Wallpapers: show the resulting counts, not just the percentage. "75%" does
       not tell anyone how many files they are about to download, and the split
       control is meaningless unless a mix was chosen. */
    const wpMode = document.getElementById('wallpapers')?.value || 'none';
    const wpSplitSel = document.getElementById('wallpaper_split');
    const wpCountSel = document.getElementById('wallpaper_count');
    const wpNote = document.getElementById('wallpaper-note');
    const wpOn = wpMode !== 'none';
    // "All of them" answers both of the following, so they are disabled rather
    // than left offering a choice that no longer changes anything.
    if (wpCountSel) wpCountSel.disabled = !wpOn || wpMode === 'all';
    if (wpSplitSel) wpSplitSel.disabled = wpMode !== 'mixed';
    if (wpNote) {
        if (!wpOn) { wpNote.style.display = 'none'; }
        else {
            const c = wallpaperCounts(wpMode, wpCountSel?.value, wpSplitSel?.value);
            wpNote.style.display = 'block';
            wpNote.textContent = '🖼️ ' + c.total + ' image' + (c.total === 1 ? '' : 's') +
                (c.dark && c.light ? ' — ' + c.dark + ' dark and ' + c.light + ' light'
                                   : c.dark ? ' from the dark set' : ' from the light set') +
                ', roughly ' + Math.max(1, Math.round(c.total * 0.15)) + ' MB. ' +
                'Chosen at random, so you get a different set each time.';
        }
    }

    const dsNote = document.getElementById('ds-forced-note');
    if (dsNote) {
        dsNote.style.display = dsForced ? 'block' : 'none';
        if (dsForced) {
            dsNote.textContent = '🔒 ' + (desktop === 'dusky' ? 'Dusky' : desktop) +
                ' runs on ' + (dsForced === 'wayland' ? 'Wayland' : 'Xorg') +
                ' only, so the display server is fixed. Change the desktop to choose it yourself.';
        }
    }

    if (part.value === 'unencrypted') warnings.push("⚠️ No encryption — physical access = full compromise.");
    if (gpuBrand === 'nvidia' && softwareType === 'libre') warnings.push("⚠️ Nvidia + Libre = Nouveau only. Limited performance.");
    // dwm is Xorg-only. Dusky is not — it is Hyprland, which is Wayland-only.
    // This line used to name both, so choosing Dusky pinned it to Wayland and
    // then warned in the same breath that Wayland would break it.
    if (displayServer === 'wayland' && desktop === 'dwm') warnings.push("⚠️ dwm requires X11/Xorg. Wayland will break it.");
    if (displayServer === 'xorg' && (desktop === 'dusky' || desktop === 'hyprland')) warnings.push(`⚠️ ${desktop === 'dusky' ? 'Dusky' : 'Hyprland'} requires Wayland. Hyprland has no Xorg backend.`);

    /* Two applications that do the same job, noticed as the boxes are ticked
       rather than only once the guide is generated. This is the analysis the
       reader is actually watching, so it is where the notice belongs; the same
       text also goes into the generated guide, from the same table. */
    if (typeof window.appOverlaps === 'function') {
        const tickedApps = Array.from(
            document.querySelectorAll('input[name="post_apps"]:checked')
        ).map(cb => cb.value);
        window.appOverlaps(tickedApps).forEach(o => {
            warnings.push('ℹ️ ' + window.appOverlapText(o).join(' '));
        });
    }

    window.smartAnalysisWarnings = warnings;
    const div = document.getElementById('global-warnings');
    if (div) {
        div.innerHTML = warnings.map(w => `<div class="alert warning" style="margin-bottom:0.4rem;">${w}</div>`).join('');
        div.style.display = warnings.length ? 'block' : 'none';
    }

    if (typeof window.generateOutput === 'function') window.generateOutput(true);
}

validateConfigurations();

// ── Config restore ──
// Selections handed over from another page (security-tools.html "Apply to
// Generator", or a restored .sc config).
const restoreConfig = sessionStorage.getItem('arch_restore_config');
if (restoreConfig) {
    try {
        const c = JSON.parse(restoreConfig);
        const map = {
            initSys: 'init_system', kernelMain: 'kernel-main', kernelBackup: 'kernel-backup',
            fakeEvilMaid: 'fake-evil-maid', format: 'outputformat', part: 'partitioning',
            disk: 'target-disk', fw: 'firmware', fs: 'filesystem', boot: 'bootloader'
        };
        // Checkbox groups are addressed by name, scalar fields by element id.
        const checkboxGroups = ['post_apps', 'other_sec_tools', 'boot_theme'];

        Object.keys(c).forEach(k => {
            if (checkboxGroups.includes(k) && Array.isArray(c[k])) {
                document.querySelectorAll(`input[name="${k}"]`).forEach(cb => {
                    // additive:true adds to the current selection instead of
                    // replacing it, so arriving from the tools page doesn't wipe
                    // choices the user already made here.
                    cb.checked = c.additive ? (cb.checked || c[k].includes(cb.value))
                                            : c[k].includes(cb.value);
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                });
                return;
            }
            if (k === 'additive') return;
            const el = document.getElementById(map[k] || k);
            if (!el) return;
            el.value = c[k];
            // Setting .value does not fire change, so any dependent logic
            // (Dusky forcing Wayland, the libre policy disabling apps, the
            // duress and USB-kill sub-options) would not re-apply on restore.
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        sessionStorage.removeItem('arch_restore_config');
    } catch (e) {
        console.error('Could not apply restored configuration:', e);
    }
}

// Banner cursor (link already in HTML <a> tag)
const banner = document.querySelector('.banner');
if (banner) banner.style.cursor = 'pointer';

// Update history tooltip on load
updateHistoryTooltip();

// ─── Live Editor / Upload Handler ─────────────────────────────────────────────
(function initLiveEditor() {
    const fileInput      = document.getElementById('upload-file-input');
    const clearBtn       = document.getElementById('upload-clear-btn');
    const statusEl       = document.getElementById('upload-status');
    const editorWrapper  = document.getElementById('upload-editor-wrapper');
    const filenameEl     = document.getElementById('upload-filename');
    const editor         = document.getElementById('upload-editor');
    const restoreBtn     = document.getElementById('upload-restore-btn');
    const downloadBtn    = document.getElementById('upload-download-btn');
    const restoreBtnAlt  = document.getElementById('upload-restore-btn-alt');
    const restoreWrap    = document.getElementById('upload-restore-btn-wrapper');

    if (!fileInput) return;

    let currentFilename = '';
    let parsedConfig    = null;
    let isValid         = false;

    const VALID_EXTS    = ['.sh', '.md', '.bash', '.txt'];

    function setStatus(msg, color) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.style.color = color || 'var(--accent-cyan)';
    }

    function tryParseConfig(text) {
        // Look for embedded config comment block
        const m1 = text.match(/<!--\s*CONFIG_START\s*([\s\S]*?)\s*CONFIG_END\s*-->/);
        if (m1) { try { return unwrapConfig(JSON.parse(m1[1])); } catch(e) {} }
        /* Shell script config block. One line, because the whole line has to be
           a shell comment for the script to run.

           Anchored to the end of that line rather than stopping at the first
           terminator it meets. Free text reaches this — package names, a
           timezone, an app's own configuration — and a value containing the
           end marker would otherwise cut the JSON short, so the parse would
           fail and the restore would quietly do nothing. Ending at the last
           marker on the line is the reading that survives that. */
        const m2 = text.match(/^###\s*CONFIG_START\s+([^\n]*?)\s+###\s*CONFIG_END\s*$/m);
        if (m2) { try { return unwrapConfig(JSON.parse(m2[1])); } catch(e) {} }
        return null;
    }

    function reset() {
        currentFilename = '';
        parsedConfig    = null;
        isValid         = false;
        if (fileInput)     fileInput.value = '';
        if (clearBtn)      clearBtn.style.display = 'none';
        if (editorWrapper) editorWrapper.style.display = 'none';
        if (restoreWrap)   restoreWrap.style.display = 'none';
        if (editor)        editor.value = '';
        setStatus('');
    }

    function loadFile(file) {
        if (!file) return;

        // Check extension
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!VALID_EXTS.includes(ext)) {
            setStatus('⚠ Invalid file type. Only .sh, .md, .bash, or .txt files are accepted.', 'var(--accent-red)');
            if (fileInput) fileInput.value = '';
            return;
        }

        currentFilename = file.name;

        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;

            // Try to parse config
            parsedConfig = tryParseConfig(text);
            isValid = parsedConfig !== null;

            // Populate editor
            if (editor) editor.value = text;
            if (filenameEl) filenameEl.textContent = file.name + (isValid ? '' : ' (no valid config — editable only)');

            // Show/hide restore button
            if (restoreBtn)  restoreBtn.style.display  = isValid ? '' : 'none';
            if (restoreWrap) restoreWrap.style.display   = isValid ? '' : 'none';
            if (restoreBtnAlt) restoreBtnAlt.style.display = isValid ? '' : 'none';

            // Show UI
            if (clearBtn)      clearBtn.style.display      = '';
            if (editorWrapper) editorWrapper.style.display  = '';

            if (isValid) {
                setStatus('✓ Valid config file — settings can be restored to the generator.', 'var(--accent-green)');
            } else {
                setStatus('ℹ No valid config header found. Showing file as editable text only.', 'var(--accent-orange, #ff9e64)');
            }
        };
        reader.readAsText(file);
    }

    // ── Event listeners ──────────────────────────────────
    if (fileInput) fileInput.addEventListener('change', function() {
        loadFile(this.files[0]);
    });

    if (clearBtn) clearBtn.addEventListener('click', reset);

    // Restore config to generator form
    function doRestore() {
        if (!parsedConfig) return;
        const map = { initSys:'init_system', kernelMain:'kernel-main', kernelBackup:'kernel-backup',
                      secTools:'securitytools', fakeEvilMaid:'fake-evil-maid', format:'outputformat',
                      part:'partitioning', disk:'target-disk', fw:'firmware', fs:'filesystem', boot:'bootloader' };
        Object.keys(parsedConfig).forEach(k => {
            if (k === 'post_apps' && Array.isArray(parsedConfig[k])) {
                document.querySelectorAll('input[name="post_apps"]').forEach(cb => {
                    cb.checked = parsedConfig[k].includes(cb.value);
                });
                return;
            }
            const el = document.getElementById(map[k] || k);
            if (el) el.value = parsedConfig[k];
        });
        setStatus('✓ Settings restored to generator! Adjust options above then re-generate.', 'var(--accent-green)');
        setTimeout(() => setStatus(isValid ? '✓ Valid config file loaded.' : '', 'var(--accent-cyan)'), 4000);
        validateConfigurations();
        // Scroll to top of generator
        const form = document.getElementById('install-form');
        if (form) form.scrollIntoView({ behavior: 'smooth' });
    }

    if (restoreBtn)    restoreBtn.addEventListener('click', doRestore);
    if (restoreBtnAlt) restoreBtnAlt.addEventListener('click', doRestore);

    // Download edited file
    if (downloadBtn) downloadBtn.addEventListener('click', () => {
        if (!editor || !currentFilename) return;
        downloadFile(editor.value, currentFilename);
    });

    // Live Editor nav link: smooth scroll to section
    const liveEditorNav = document.getElementById('live-editor-nav');
    if (liveEditorNav) {
        liveEditorNav.addEventListener('click', e => {
            e.preventDefault();
            const sec = document.getElementById('live-editor');
            if (sec) sec.scrollIntoView({ behavior: 'smooth' });
        });
    }
})();

// ─── Bind Generate Button ───
// Duplicate listener removed to prevent double-firing and bypassing validation.

const historyBtn = document.getElementById('history-btn');
if (historyBtn) {
    historyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.toggleHistoryModal();
    });
}


/* The scrolled-to section and the selected system both want the tab title.
   They used to write it independently, so whichever ran last won: scrolling
   past one section replaced "Arch Install Generator" with a fixed string and
   the tab stopped naming the system for the rest of the visit. Both go through
   here now, and the section is remembered rather than re-read from the DOM. */
let currentStepTitle = '';

function refreshDocumentTitle() {
    const meta = (typeof window.targetOS === 'function' && window.OS_META)
        ? window.OS_META[window.targetOS()]
        : null;
    // `short` is what the nav uses ("Arch Install Generator"), so the tab and
    // the link a reader clicked to get here agree.
    const base = meta ? (meta.short || meta.label) + ' Install Generator'
                      : '*nix Install Generator';
    document.title = currentStepTitle ? base + ' | ' + currentStepTitle : base;
}

// Dynamic document.title on scroll
document.addEventListener('DOMContentLoaded', () => {
    const steps = document.querySelectorAll('.form-step');
    if (!steps.length) return;
    // Feature-detect rather than assume. IntersectionObserver is absent on
    // older mobile engines (and in some embedded webviews); without this guard
    // the ReferenceError aborts the rest of this DOMContentLoaded handler, so a
    // cosmetic title effect would take working form logic down with it. Losing
    // the scroll-updated title on those browsers is the correct trade.
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const title = entry.target.getAttribute('data-title');
                if (title) {
                    currentStepTitle = title;
                    refreshDocumentTitle();
                }
            }
        });
    }, { threshold: 0.5 });
    steps.forEach(step => observer.observe(step));
});


// Libre Policy Logic
const libreToggle = document.getElementById('libre_policy_toggle');
if (libreToggle) {
    libreToggle.addEventListener('change', () => {
        document.querySelectorAll('input[name="post_apps"]').forEach(checkbox => {
            const label = checkbox.closest('label');
            if (!label) return;
            const isProprietary = label.innerHTML.includes('[PROPRIETARY]') || label.innerHTML.includes('Proprietary / Non-Libre software');
            
            if (libreToggle.checked && isProprietary) {
                // If policy is ON, and it's proprietary, highlight it red if it's checked
                if (checkbox.checked) {
                    label.style.border = '2px solid var(--accent-red)';
                    label.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
                    label.style.padding = '0.4rem';
                    label.style.borderRadius = '6px';
                } else {
                    label.style.border = '1px solid transparent';
                    label.style.boxShadow = 'none';
                }
            } else {
                // Reset styles
                if (isProprietary) {
                    label.style.border = '1px solid transparent';
                    label.style.boxShadow = 'none';
                }
            }
        });
    });
}

// Add event listener to post_apps to trigger libre logic on click
document.querySelectorAll('input[name="post_apps"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        if (libreToggle && libreToggle.checked) {
            libreToggle.dispatchEvent(new Event('change'));
        }
    });
});



// ==========================================
// APP CONFIGURER OVERLAY LOGIC
// ==========================================
function openAppConfigModal(appId) {
    currentConfigAppId = appId;
    currentConfigSaved = false;

    // Check for Phase 4 dedicated modals
    const dedicatedModal = document.getElementById('modal-' + appId);
    if (dedicatedModal) {
        dedicatedModal.style.display = 'flex';
        return;
    }

    const modal = document.getElementById('app-config-modal');
    if (!modal) return;
    const title = document.getElementById('modal-title');
    const desc = document.getElementById('modal-desc');
    const contentArea = document.getElementById('modal-content-area');

    
    // Clear previous
    contentArea.innerHTML = '';
    

    // Map app IDs to their specific config UIs
    if (appId === 'libre-otp') {
        title.innerHTML = '⚙️ Libre OTP Configuration';

        desc.innerText = 'Configure your Time-Based One Time Password settings for PAM (sudo, su, ssh).';
        contentArea.innerHTML = `
            <div style="margin-bottom:1rem;">
                <label>OTP Mode:</label>
                <select id="modal_otp_mode" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="sudo">sudo only</option>
                    <option value="su">su only</option>
                    <option value="ssh">ssh only</option>
                    <option value="boot">Boot/Login only</option>
                    <option value="both">sudo + ssh</option>
                    <option value="all">All (sudo, su, ssh, boot)</option>
                </select>
            </div>
            <div style="margin-bottom:1rem;">
                <label>Bypass Uses (e.g. 3 uses before requiring OTP):</label>
                <input type="number" id="modal_otp_bypass" value="0" min="0" max="10" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
            </div>
            <div style="margin-bottom:1rem;">
                <label>Display Mode (TTY/ANSI):</label>
                <select id="modal_otp_display" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="discreet" selected>Discreet (Bottom-Left OTP, Top-Left Pass in White)</option>
                    <option value="visible">Visible (Red Animated Monospace, Tokyo Night)</option>
                </select>
            </div>
            <p style="font-size:0.8rem; color:var(--accent-red);">Note: Verification will be required to confirm your authenticator code before configuration locks.</p>
        `;
    } else if (appId === 'evil-maid') {
        title.innerHTML = '⚙️ Anti-Evil Maid Configuration';
        desc.innerText = 'Configure decoy kernels, LUKS auto-lock, and duress passwords.';
        // modal_aem_decoy_mode and modal_aem_duress_mode are read by the script
        // emitter but had no markup here at all, so getElementById always
        // returned null, the `|| 'none'` default always won, and the duress
        // block could never fire no matter what the user picked. Adding the
        // controls the emitter was already looking for.
        contentArea.innerHTML = `
            <div style="margin-bottom:1rem;">
                <label>Decoy Kernels:</label>
                <select id="modal_aem_decoy" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="1">1 Decoy (Basic)</option>
                    <option value="2">2 Decoys</option>
                    <option value="random">Randomized Decoy Selection</option>
                </select>
            </div>
            <div style="margin-bottom:1rem;">
                <label>LUKS auto-lock:</label>
                <select id="modal_aem_autolock" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="never" selected>None — lock on demand only</option>
                    <option value="15m">After 15 minutes idle</option>
                    <option value="1h">After 1 hour idle</option>
                    <option value="8h">After 8 hours idle</option>
                    <option value="on-lock">Whenever the session locks</option>
                </select>
                <p style="font-size:0.8rem; color:var(--fg-dim); margin-top:0.35rem;">
                    Locking the screen leaves the LUKS master key in kernel memory.
                    Suspending the volume flushes it. Requires disk encryption.
                </p>
            </div>
            <div style="margin-bottom:1rem;">
                <label>Suspend LUKS when the screen locks:</label>
                <select id="modal_aem_lock_on_screen" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="no" selected>No — screen lock only</option>
                    <option value="yes">Yes — make the lock screen a cryptographic barrier</option>
                </select>
                <p style="font-size:0.8rem; color:var(--accent-red); margin-top:0.35rem;">
                    Getting back in then needs the disk passphrase, not just your login
                    password. Test it first: the moment your screensaver fires, the disk
                    freezes until you type it.
                </p>
            </div>
            <div style="margin-bottom:1rem;">
                <label>Decoy password (Scarecrow):</label>
                <select id="modal_aem_decoy_mode" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="none" selected>None</option>
                    <option value="session">Opens a working decoy session, erases nothing</option>
                </select>
            </div>
            <div style="margin-bottom:1rem;">
                <label>Duress password (Scarecrow):</label>
                <select id="modal_aem_duress_mode" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="none" selected>None</option>
                    <option value="erase">Erases the LUKS header, then acts like a wrong password</option>
                </select>
                <p style="font-size:0.8rem; color:var(--accent-red); margin-top:0.35rem;">
                    Irreversible without a header backup. The script takes one first and
                    tells you to move it off the machine — do that, or a mistake is final.
                    Choosing both a decoy and a duress password sets the combined PIN:
                    the header is erased and a working session still appears.
                </p>
            </div>
        `;
} else if (appId === 'git') {
        title.innerHTML = '⚙️ Git Configuration';
        desc.innerText = 'Configure your global Git username and email.';
        contentArea.innerHTML = `
            <div style="margin-bottom:1rem;">
                <label>Global Username:</label>
                <input type="text" id="modal_git_user" placeholder="John Doe" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
            </div>
            <div style="margin-bottom:1rem;">
                <label>Global Email:</label>
                <input type="email" id="modal_git_email" placeholder="john@example.com" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
            </div>
        `;
    } else if (appId === 'timeshift') {
        title.innerHTML = '⚙️ Timeshift Configuration';
        desc.innerText = 'Configure automated system snapshots.';
        contentArea.innerHTML = `
            <div style="margin-bottom:1rem;">
                <label>Snapshot Mode:</label>
                <select id="modal_timeshift_mode" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="rsync">RSYNC (Works on any filesystem)</option>
                    <option value="btrfs">BTRFS (Requires BTRFS root)</option>
                </select>
            </div>
            <div style="margin-bottom:1rem;">
                <label>Schedule:</label>
                <select id="modal_timeshift_schedule" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="daily">Daily (Keep 5)</option>
                    <option value="weekly">Weekly (Keep 3)</option>
                    <option value="boot">On Boot (Keep 3)</option>
                </select>
            </div>
        `;
    } else if (appId === 'snapper') {
        title.innerHTML = '⚙️ Snapper Configuration';
        desc.innerText = 'Advanced BTRFS snapshot configuration.';
        contentArea.innerHTML = `
            <div style="margin-bottom:1rem;">
                <label>Timeline Config:</label>
                <select id="modal_snapper_timeline" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="enabled">Enabled (Hourly snapshots)</option>
                    <option value="disabled">Disabled (Manual only)</option>
                </select>
            </div>
        `;
    } else if (appId === 'unattended-upgrades') {
        title.innerHTML = '⚙️ Unattended Upgrades';
        desc.innerText = 'Configure automatic background updates.';
        contentArea.innerHTML = `
            <div style="margin-bottom:1rem;">
                <label>Automatic Reboot:</label>
                <select id="modal_upgrade_reboot" style="width:100%; padding:0.5rem; background:var(--bg-light); border:1px solid var(--accent-blue); color:white; border-radius:4px;">
                    <option value="false">No (Manual reboot only)</option>
                    <option value="true">Yes (Automatically reboot at 02:00 if required)</option>
                </select>
            </div>
        `;
    } else {
        // Fallback for apps without specific config logic yet
        const capId = appId.charAt(0).toUpperCase() + appId.slice(1);
        title.innerHTML = `⚙️ ${capId} Configuration`;
        desc.innerText = `Advanced configuration for ${appId} is not yet implemented. This app will be installed with default settings.`;
        contentArea.innerHTML = `<p style="color:var(--accent-green);">Marking as configured...</p>`;
    }
    
    modal.style.display = 'flex';
    
    // Save button logic
    document.getElementById('save-modal-btn').onclick = function(e) {
        e.preventDefault();
        // Here we would extract the values from the modal inputs and save them globally
        // For now, we just mark the checkbox as configured
        const cb = document.querySelector(`input[type="checkbox"][value="${appId}"]`);
        if (cb) {
            cb.dataset.configured = "true";
            cb.checked = true; // ensure it's checked
            // Make gear icon green to indicate success
            const gear = cb.parentElement.querySelector('.gear-config-btn');
            if(gear) gear.style.textShadow = '0 0 5px var(--accent-green)';
        }
        modal.style.display = 'none';
    };
}

// Close button logic
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-modal-btn');
    const modal = document.getElementById('app-config-modal');
    if (closeBtn && modal) {
        // Use addEventListener to ensure it's bound regardless of other script overrides
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = 'none';
        });
        // Keep the old assignment just in case
        closeBtn.onclick = (e) => {
            e.preventDefault();
            modal.style.display = 'none';
        };
    }
    
    // Auto-open modal when a configurable checkbox is checked
    document.querySelectorAll('input[type="checkbox"][data-requires-config="true"]').forEach(cb => {
        cb.addEventListener('change', function() {
            const gear = this.parentElement.querySelector('.gear-config-btn');
            if (this.checked) {
                if (gear) gear.style.display = 'inline';
                // Only auto-open if not already configured
                if (this.dataset.configured !== "true") {
                    openAppConfigModal(this.value);
                }
            } else {
                if (gear) gear.style.display = 'none';
                this.dataset.configured = "false"; // reset on uncheck
                if(gear) gear.style.textShadow = 'none';
            }
        });
    });
});

// ====================================================================
// NEW UI TOGGLES (App Configs & Live Editor)
// ====================================================================

window.toggleAppConfig = function(appId) {
    const configDiv = document.getElementById('config-' + appId);
    const containerDiv = document.getElementById('container-' + appId);
    if (!configDiv) return;

    const cb = document.querySelector(`input[name="post_apps"][value="${appId}"]`);

    // Automatically check the box when opening the config if it's not checked
    if (configDiv.style.display === 'none') {
        configDiv.style.display = 'block';
        if (cb) cb.checked = true;
        if (containerDiv) containerDiv.style.borderColor = "var(--accent-blue)";
    } else {
        configDiv.style.display = 'none';
        if (containerDiv) containerDiv.style.borderColor = "var(--border-color)";
    }
};

// One place that fills a static output block and highlights it. These are
// rewritten on every generation, so they must be re-highlighted each time
// rather than skipped as already-done.
function setBlock(id, text, lang) {
    const code = document.getElementById(id)?.querySelector('code');
    if (!code) return;
    if (window.setHighlightedCode) window.setHighlightedCode(code, text, lang);
    else code.textContent = text;
}

// The staging editor has three panes (guide, install script, post-install
// script), each with a textarea and a syntax-highlighted <pre> mirror. The
// previous version addressed single #live-editor-textarea / -preview / -code
// elements that do not exist in the markup, so it threw on the first null and
// the Raw Edit / Syntax Preview switch did nothing.
const LIVE_EDITOR_PANES = [
    { textarea: 'live-editor-textarea-md',   preview: 'live-editor-preview-md' },
    { textarea: 'live-editor-textarea-sh',   preview: 'live-editor-preview-sh' },
    { textarea: 'live-editor-textarea-post', preview: 'live-editor-preview-post' }
];

// Copies textarea content into the highlighted mirrors and re-highlights.
window.refreshLiveEditorPreviews = function() {
    LIVE_EDITOR_PANES.forEach(pane => {
        const ta = document.getElementById(pane.textarea);
        const pre = document.getElementById(pane.preview);
        if (!ta || !pre) return;
        const code = pre.querySelector('code');
        if (!code) return;
        // setHighlightedCode() clears the done-marker first. Plain
        // highlightElement() would skip a pane that had already been rendered,
        // so every edit after the first would show stale colours.
        if (window.setHighlightedCode) window.setHighlightedCode(code, ta.value);
        else code.textContent = ta.value;
    });
};

window.toggleLiveEditorMode = function() {
    const toggle = document.getElementById('live-preview-toggle');
    const showPreview = !!(toggle && toggle.checked);

    if (showPreview) window.refreshLiveEditorPreviews();

    LIVE_EDITOR_PANES.forEach(pane => {
        const ta = document.getElementById(pane.textarea);
        const pre = document.getElementById(pane.preview);
        if (ta) ta.style.display = showPreview ? 'none' : 'block';
        if (pre) pre.style.display = showPreview ? 'block' : 'none';
    });
};

// ====================================================================
// NEW SPA WORKFLOW: History & Modals & File Uploads
// ====================================================================

// Clear Generator Form
window.clearFormSelections = function() {
    document.querySelectorAll('.generator-form select').forEach(sel => {
        sel.value = "";
        sel.style.border = "";
        const warn = sel.parentElement.querySelector('.req-warning');
        if (warn) warn.remove();
        
        // Re-inject "No Selection Provided" if missing
        if (!Array.from(sel.options).find(o => o.value === "")) {
            const opt = document.createElement('option');
            opt.value = "";
            opt.text = "No Selection Provided";
            opt.disabled = true;
            opt.selected = true;
            opt.hidden = true;
            sel.insertBefore(opt, sel.firstChild);
        }
    });
    
    document.querySelectorAll('#install-form input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
    });
    
    document.querySelectorAll('input[type="text"]').forEach(input => input.value = "");
    
    const errBox = document.getElementById('generate-error-box');
    if (errBox) errBox.style.display = 'none';
};

// Split Scripts Toggle in Live Editor
window.toggleSplitScripts = function() {
    const toggle = document.getElementById('split-scripts-toggle');
    const postContainer = document.getElementById('live-editor-post-sh-container');
    const titleInstall = document.getElementById('title-install-sh');
    const split = !!(toggle && toggle.checked);

    if (postContainer) postContainer.style.display = split ? 'block' : 'none';
    if (titleInstall) {
        titleInstall.textContent = split
            ? "Install Script (.sh)"
            : "Unified Install & Post-Install Script (.sh)";
    }
};

// Confirm & Save Live Editor
window.confirmAndSaveLiveEditor = function() {
    // Collect final strings
    const finalMd = document.getElementById('live-editor-textarea-md').value;
    
    let finalSh = document.getElementById('live-editor-textarea-sh').value;
    let finalPost = document.getElementById('live-editor-textarea-post').value;
    
    const isSplit = document.getElementById('split-scripts-toggle').checked;
    if (!isSplit) {
        // Unified Mode: Inject post-install script at the end of the install script
        // with auto-execution and clean-up wrappers
        if (finalPost.trim() !== "") {
            finalSh += "\n\n# ==========================================\n";
            finalSh += "# AUTO-EXECUTING POST-INSTALL SCRIPT\n";
            finalSh += "# ==========================================\n";
            finalSh += "echo 'Running Post-Install Configuration...'\n";
            finalSh += finalPost;
            finalSh += "\n\n# Cleanup and Exit\n";
            finalSh += "echo 'Installation and Post-Install Complete.'\n";
        }
        finalPost = ""; // Clear post since it's unified
    }
    
    // Record the confirmed edit in session history. `history` here used to
    // refer to the browser's window.history object, so unshift() threw and this
    // whole function aborted before it could show the static output.
    const entries = readHistory();
    entries.unshift({
        id: Date.now().toString(),
        timestamp: timestampNow(),
        format: 'both',
        md: finalMd,
        sh: finalSh,
        post: finalPost,
        sc: sessionStorage.getItem('last_generated_sc') || '{}'
    });
    writeHistory(entries.slice(0, HISTORY_LIMIT));
    updateHistoryTooltip();

    // Keep the standalone Live Editor in sync with the confirmed content.
    stageForLiveEditor(finalMd, finalSh, finalPost);


    // Transition to Static Output
    document.getElementById('live-editor').style.display = 'none';
    const outSec = document.getElementById('output-section');
    outSec.style.display = 'block';
    
    // Populate static blocks
    setBlock('static-md', finalMd, 'markdown');
    setBlock('static-install', finalSh, 'bash');
    
    const postContainer = document.getElementById('static-post-container');
    if (!isSplit || !finalPost.trim()) {
        postContainer.style.display = 'none';
        document.getElementById('static-title-install').innerHTML = "⚙️ Unified Install Script (.sh)";
    } else {
        postContainer.style.display = 'block';
        setBlock('static-post', finalPost, 'bash');
        document.getElementById('static-title-install').innerHTML = "⚙️ Install Script (.sh)";
    }
    
    
    // Render SSH Deployment Commands
    const sshContainer = document.getElementById('ssh-commands-container');
    if (sshContainer) {
        if (!isSplit || !finalPost.trim()) {
            // Unified Mode
            sshContainer.innerHTML = `
                <div style="background:var(--bg-color); border-left:4px solid var(--accent-cyan); padding:0.8rem; border-radius:4px;">
                    <strong style="color:var(--accent-cyan); font-size:0.8rem; display:block; margin-bottom:0.4rem;">1. Transfer & Execute Unified Script:</strong>
                    <code style="color:var(--fg-color); font-family:var(--font-mono); font-size:0.85rem; word-break:break-all;">scp install.sh root@&lt;TARGET-IP&gt;:/root/ && ssh root@&lt;TARGET-IP&gt; "bash /root/install.sh"</code>
                </div>
            `;
        } else {
            // Split Mode
            sshContainer.innerHTML = `
                <div style="background:var(--bg-color); border-left:4px solid var(--accent-cyan); padding:0.8rem; border-radius:4px;">
                    <strong style="color:var(--accent-cyan); font-size:0.8rem; display:block; margin-bottom:0.4rem;">1. Transfer & Execute Install Script:</strong>
                    <code style="color:var(--fg-color); font-family:var(--font-mono); font-size:0.85rem; word-break:break-all;">scp install.sh root@&lt;TARGET-IP&gt;:/root/ && ssh root@&lt;TARGET-IP&gt; "bash /root/install.sh"</code>
                </div>
                <div style="background:var(--bg-color); border-left:4px solid var(--accent-blue); padding:0.8rem; border-radius:4px;">
                    <strong style="color:var(--accent-blue); font-size:0.8rem; display:block; margin-bottom:0.4rem;">2. After Reboot & Login, Transfer & Execute Post-Install Script:</strong>
                    <code style="color:var(--fg-color); font-family:var(--font-mono); font-size:0.85rem; word-break:break-all;">scp post_install.sh &lt;USERNAME&gt;@&lt;TARGET-IP&gt;:~/ && ssh &lt;USERNAME&gt;@&lt;TARGET-IP&gt; "bash ~/post_install.sh"</code>
                </div>
            `;
        }
    }

    window.scrollTo({ top: outSec.offsetTop - 20, behavior: 'smooth' });
};

// Handle Raw File Uploads (.sh / .md)
document.addEventListener('DOMContentLoaded', () => {
    const srcInput = document.getElementById('upload-source-input');
    if (srcInput) {
        srcInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const content = ev.target.result;
                const ext = file.name.split('.').pop().toLowerCase();
                
                // Show Live Editor, hide generator
                document.querySelector('.generator-form').style.display = 'none';
                document.getElementById('live-editor').style.display = 'block';
                
                if (ext === 'md') {
                    document.getElementById('live-editor-textarea-md').value = content;
                } else if (ext === 'sh') {
                    document.getElementById('live-editor-textarea-sh').value = content;
                }
                
                // Switch to raw edit mode
                document.getElementById('live-preview-toggle').checked = false;
                window.toggleLiveEditorMode();
                
                window.scrollTo({ top: document.getElementById('live-editor').offsetTop - 20, behavior: 'smooth' });
            };
            reader.readAsText(file);
        });
    }
});

// Generation History Modal Logic
// NOTE: openHistoryModal / clearHistory are defined once, near the top of this
// file alongside the rest of the history helpers.

window.downloadString = function(b64, filename) {
    const text = decodeURIComponent(escape(atob(b64)));
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
};

window.downloadContentStatic = function(id, filename) {
    const content = document.getElementById(id).querySelector('code').textContent;
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
};

window.downloadAllOutput = function() {
    alert("In a real environment, this would zip the currently displayed .md and .sh files. Use the individual buttons for now.");
};


// Phase 4: Right-Click Teleport to Wiki
// Right-click on a generator control opens its wiki entry. Resolved by
// tooltip.js against its curated map; see the note further down for why the two
// slug-guessing handlers that used to be here were removed.

// NOTE: closeAppConfigModal is defined once, near the top of this file, where
// it also handles the discard-and-uncheck behaviour. A second plain-hide
// definition used to live here and was silently overwritten at load.

function saveAppConfig(appId) {
    window.closeAppConfigModal();
    
    // Find the checkbox and mark it as configured
    const cb = document.querySelector(`input[type="checkbox"][value="${appId}"]`);
    
    // Save config variables to dataset
    if (appId === 'git') {
        cb.dataset.gitUser = document.getElementById('modal_git_user')?.value || '';
        cb.dataset.gitEmail = document.getElementById('modal_git_email')?.value || '';
    } else if (appId === 'timeshift') {
        cb.dataset.timeshiftMode = document.getElementById('modal_timeshift_mode')?.value || 'rsync';
        cb.dataset.timeshiftSchedule = document.getElementById('modal_timeshift_schedule')?.value || 'daily';
    } else if (appId === 'snapper') {
        cb.dataset.snapperTimeline = document.getElementById('modal_snapper_timeline')?.value || 'enabled';
    } else if (appId === 'unattended-upgrades') {
        cb.dataset.upgradeReboot = document.getElementById('modal_upgrade_reboot')?.value || 'false';
    }

    // Save Libre-OTP config to dataset if applicable
    if (appId === 'libre-otp') {
        const mode = document.getElementById('modal_otp_mode')?.value || 'both';
        const bypass = document.getElementById('modal_otp_bypass')?.value || '0';
        const display = document.getElementById('modal_otp_display')?.value || 'discreet';
        cb.dataset.otpMode = mode;
        cb.dataset.otpBypass = bypass;
        cb.dataset.otpDisplay = display;
    }

    if(cb) {
        cb.dataset.configured = "true";
        cb.parentElement.style.border = "2px solid var(--accent-green)";
        cb.parentElement.style.padding = "5px";
        cb.parentElement.style.borderRadius = "4px";
    }
}


// Added Deploy Output functionality
function deployOutput() {
    const el = document.createElement('textarea');
    el.value = `wget -qO- https://raw.githubusercontent.com/tilas01/Unix-SIT/main/arch-setup.sh | bash`;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    alert("Deploy command copied to clipboard! Paste it into the target SSH terminal.");
}


document.getElementById('live-editor-nav')?.addEventListener('click', function(e) {
    e.preventDefault();
    const liveEditor = document.getElementById('live-editor');
    const outSec = document.getElementById('output-section');
    const genForm = document.querySelector('.generator-form');
    if (liveEditor) {
        liveEditor.style.display = 'block';
        if (outSec) outSec.style.display = 'none';
        if (genForm) genForm.style.display = 'none';
        liveEditor.scrollIntoView({ behavior: 'smooth' });
    }
});

// Also fix the generator button returning to form
document.querySelector('a[href="index.html"]')?.addEventListener('click', function(e) {
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
        e.preventDefault();
        const liveEditor = document.getElementById('live-editor');
        const outSec = document.getElementById('output-section');
        const genForm = document.querySelector('.generator-form');
        if (genForm) genForm.style.display = 'block';
        if (outSec) outSec.style.display = 'none';
        if (liveEditor) liveEditor.style.display = 'none';
    }
});


// ── Group select-all / select-none ("lock select") ──
// Both buttons toggle: first click selects the whole group, second clears it.
// The button reflects the current state so it is never ambiguous.
const TILAS_TOOL_VALUES = ['libre-otp', 'anti-ducky', 'anti-evil-maid',
                           'kernel-watcher', 'scarecrow'];

// Colour is driven entirely by CSS via [aria-pressed], so nothing here sets an
// inline background. That keeps the flat Tokyo Night palette in one place
// instead of hard-coding gradient strings in JavaScript.
function toggleGroup(checkboxes, btn, labels) {
    const boxes = Array.from(checkboxes);
    if (boxes.length === 0) return;
    // If any box is unchecked, select all; otherwise clear the group.
    const turnOn = boxes.some(cb => !cb.checked);
    boxes.forEach(cb => {
        if (cb.checked !== turnOn) {
            cb.checked = turnOn;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    if (btn) {
        btn.textContent = turnOn ? labels.on : labels.off;
        btn.setAttribute('aria-pressed', String(turnOn));
    }
}

// ── Select / clear every post-install app ──
// Referenced by the "Enable All" control in the Post-Install Apps header. It was
// never defined, so that button threw ReferenceError on click.
function toggleAllPostApps() {
    const boxes = Array.from(document.querySelectorAll('input[name="post_apps"]'))
        // Configurable apps are included now: an unopened dialog falls back to
        // recommended settings and says so, so it no longer blocks anything.
        // Disabled boxes are still skipped — those are being forced by another
        // selection (the libre policy, or Dusky).
        .filter(cb => !cb.disabled);
    toggleGroup(
        boxes,
        document.querySelector('.post-apps-enable-btn'),
        { on: '🔒 All Selected (click to clear)', off: '✅ Enable All' }
    );
}
window.toggleAllPostApps = toggleAllPostApps;

// ── Enable All tilas01 Security Tools ──
function enableAllTilas() {
    const boxes = TILAS_TOOL_VALUES
        .map(id => document.querySelector(`input[name="post_apps"][value="${id}"]`))
        .filter(Boolean);
    toggleGroup(
        boxes,
        document.querySelector('.my-tools-enable-btn'),
        { on: '🔒 All Selected (click to clear)', off: '✅ Enable All Suite' }
    );
}

// ── Enable All Other Security Tools ──
function enableAllOtherSec() {
    toggleGroup(
        document.querySelectorAll('input[name="other_sec_tools"]'),
        document.querySelector('.other-sec-enable-btn'),
        { on: '🔒 All Selected (click to clear)', off: '✅ Enable All' }
    );
}


// ── Right-click → wiki ───────────────────────────────────────────────────────
// Handled entirely by tooltip.js, which resolves the target through a curated
// map of control → wiki page.
//
// Two ad-hoc handlers used to live here as well and were removed. Both built an
// anchor by slugifying the control's visible text — "Firmware Selection" became
// `wiki.html#firmware-selection`. An audit of all 54 labelled controls found
// that **none** of those 54 slugs matched an id that exists in wiki.html, so
// every right-click through them dropped the user at the top of the wiki rather
// than the section they asked for, silently. They also raced tooltip.js for the
// same event, so which one won depended on binding order.
//
// One resolver, with a map that is checked against wiki.html by the link audit.


// ── Dusky Locking Logic ──
document.addEventListener('DOMContentLoaded', () => {
    const duskyCheckbox = document.querySelector('input[value="duskyos"]');
    if (!duskyCheckbox) return;

    function handleDuskyLock() {
        const initSys = document.getElementById('init_system');
        const displayServ = document.getElementById('display_server');
        const networkMgr = document.getElementById('network_manager');
        const bootloader = document.getElementById('bootloader');

        if (duskyCheckbox.checked) {
            // Lock and force required settings
            if (initSys) { initSys.value = 'systemd'; initSys.disabled = true; initSys.title = "Locked by Dusky requirement"; }
            if (displayServ) { displayServ.value = 'wayland'; displayServ.disabled = true; displayServ.title = "Locked by Dusky requirement"; }
            if (networkMgr) { networkMgr.value = 'networkmanager'; networkMgr.disabled = true; networkMgr.title = "Locked by Dusky requirement"; }
            if (bootloader) { bootloader.value = 'grub'; bootloader.disabled = true; bootloader.title = "Locked by Dusky requirement"; }
        } else {
            // Unlock
            if (initSys) { initSys.disabled = false; initSys.title = ""; }
            if (displayServ) { displayServ.disabled = false; displayServ.title = ""; }
            if (networkMgr) { networkMgr.disabled = false; networkMgr.title = ""; }
            if (bootloader) { bootloader.disabled = false; bootloader.title = ""; }
        }
    }

    duskyCheckbox.addEventListener('change', handleDuskyLock);
    
    // Also attach to the desktop environments dropdown if dusky is selected there
    const deSelect = document.getElementById('desktop_env');
    if (deSelect) {
        deSelect.addEventListener('change', () => {
            if (deSelect.value === 'dusky') {
                duskyCheckbox.checked = true;
                handleDuskyLock();
            }
        });
    }

    // Run on load
    handleDuskyLock();
});


// ── Use All Security Tools Logic ──
document.addEventListener('DOMContentLoaded', () => {
    const useAllCheckbox = document.getElementById('use-all-sec-tools');
    if (!useAllCheckbox) return;

    useAllCheckbox.addEventListener('change', () => {
        // Find all security tool checkboxes
        // They have names 'my_sec_tools' and 'other_sec_tools'
        const secTools = document.querySelectorAll('input[name="my_sec_tools"], input[name="other_sec_tools"]');
        
        secTools.forEach(cb => {
            if (useAllCheckbox.checked) {
                cb.checked = true;
                cb.disabled = true;
                cb.parentElement.style.opacity = '0.7';
                cb.parentElement.title = "Locked by 'Use All Security Tools'";
            } else {
                cb.disabled = false;
                cb.parentElement.style.opacity = '1';
                cb.parentElement.title = cb.parentElement.getAttribute('data-original-title') || "";
            }
        });
    });

    // Store original titles for restoration
    const secTools = document.querySelectorAll('input[name="my_sec_tools"], input[name="other_sec_tools"]');
    secTools.forEach(cb => {
        cb.parentElement.setAttribute('data-original-title', cb.parentElement.title);
    });
});



document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'close-modal-btn') {
        e.preventDefault();
        const m = document.getElementById('app-config-modal');
        if (m) m.style.display = 'none';
    }
});


window.auditConfiguration = function() {
    let warnings = [];
    
    // 1. Strictly Libre vs Proprietary
    let swType = document.querySelector('input[name="sw_type"]:checked');
    if (swType && swType.value === 'libre') {
        let hasProprietary = false;
        let selectedApps = document.querySelectorAll('.app-card input[type="checkbox"]:checked');
        selectedApps.forEach(app => {
            if (app.parentElement.innerHTML.includes('[!]')) {
                hasProprietary = true;
                app.parentElement.style.border = '2px solid red';
                warnings.push("You are installing an app (" + app.id + ") that contains proprietary blobs despite selecting 'Strictly Libre'.");
            } else {
                app.parentElement.style.border = '1px solid var(--border-color)';
            }
        });
    }

    // 2. Bootloader Encryption Warnings
    let encType = document.querySelector('input[name="encryption"]:checked');
    let bootloader = document.querySelector('input[name="bootloader"]:checked');
    if (encType && encType.value !== 'none' && bootloader) {
        if (bootloader.value === 'systemd-boot' || bootloader.value === 'uki') {
            warnings.push("Bootloader Warning: You selected " + bootloader.value + " with encryption. Your /boot partition (EFI) will remain unencrypted. Only GRUB can fully encrypt /boot natively.");
        }
    }
    
    return warnings;
};


let configIsDirty = false;
let currentModalId = null;

window.openConfigModal = function(event, modalId) {
    if(event) { event.preventDefault(); event.stopPropagation(); }
    let modal = document.getElementById(modalId);
    if(modal) {
        modal.style.display = 'flex';
        currentModalId = modalId;
        configIsDirty = false; // Reset dirtiness
        
        // Track changes
        let inputs = modal.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.onchange = () => { configIsDirty = true; };
            input.oninput = () => { configIsDirty = true; };
        });
    }
};

window.saveConfigModal = function() {
    let modal = document.getElementById(currentModalId);
    if(modal) {
        modal.style.display = 'none';
        configIsDirty = false;
        currentModalId = null;
    }
};

window.closeConfigModal = function(modalId) {
    let modal = document.getElementById(modalId || currentModalId);
    if(modal) {
        if(configIsDirty) {
            if(!confirm("You have unsaved changes. Are you sure you want to discard them?")) {
                return;
            }
        }
        modal.style.display = 'none';
        configIsDirty = false;
        currentModalId = null;
    }
};


// NOTE: a "hard-locking" block used to sit here, carried over from an older
// branch. It called updateOutput() and appConfigs, neither of which exists, read
// an #advanced-setup-toggle that is not in the markup, and matched the
// third-party tools with name="post_apps" when they actually use
// name="other_sec_tools" - so those selectors never matched anything.
//
// The behaviour it was reaching for is now provided by the All-in-One Suite
// checkbox (mutual exclusion with an on-card explanation) and by
// APP_CONFIG_DEFAULTS (recommended settings when a dialog is never opened).
// Both are covered by tests.

// Popup Blocker Detection for Wiki
function openWiki(e) {
    if (e) e.preventDefault();
    const newWin = window.open('wiki.html', '_blank');
    if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        alert("⚠️ Your browser blocked the pop-up! Please allow pop-ups for this site to view the Wiki, or manually click the Wiki link at the top of the page.");
    }
}

/* ── The system this page generates for ──────────────────────────────────────
   The header switcher decides it; this makes the page say so. The generator's
   own output already reads the same variable, so the heading and the guide it
   produces cannot claim different systems.

   Only the wording changes here. The question set itself is still Arch's, which
   is why an unfinished system's output carries the work-in-progress banner —
   see buildOutput(). Naming the system without warning about it would be the
   worse half of this change on its own. */
function applyGeneratorOs() {
    if (typeof window.targetOS !== 'function' || !window.OS_META) return;
    const m = window.OS_META[window.targetOS()];
    const sub = document.getElementById('gen-subtitle');
    if (sub) {
        sub.textContent = 'The ultimate, dynamically customizable, and highly ' +
                          'secure guide to installing ' + m.label + '.' +
                          (m.complete === false
                              ? ' \u{1F6A7} This guide is unfinished — read it, do not run it.'
                              : '');
        sub.style.color = m.complete === false ? 'var(--accent-orange)' : '';
    }
    applyAurAvailability();
    applyOsOnlyQuestions();
    refreshDocumentTitle();
}

/* Questions that belong to one system only.
 *
 * The walkthrough gates these with a `when` predicate and simply never asks
 * them elsewhere. This form has no such machinery, so the markup carries
 * `data-os` and the group is hidden when another system is selected — the same
 * decision, expressed where this front end can act on it.
 *
 * The controls stay in the DOM rather than being removed, so their answers are
 * still read into the saved configuration. That matters for the round trip: a
 * config exported while Gentoo was selected has to survive being loaded, looked
 * at under Arch, and saved again.
 */
function applyOsOnlyQuestions() {
    const key = (typeof window.targetOS === 'function') ? window.targetOS() : 'arch';
    document.querySelectorAll('[data-os]').forEach(function (group) {
        const only = (group.getAttribute('data-os') || '').split(/\s+/).filter(Boolean);
        group.hidden = only.length > 0 && only.indexOf(key) === -1;
    });
}

/* Options that only exist because Arch has an AUR.
 *
 * Offering an AUR helper on a system with no AUR is a control wired to nothing,
 * and leaving it ticked by default puts it into the saved configuration, where
 * it reads as a package the reader asked for. The cards are disabled and say
 * why rather than disappearing: a reader who has seen this list on Arch should
 * be able to tell that the option was considered and does not apply, which is
 * the same reasoning the desktop question uses for Dusky.
 */
const AUR_ONLY_APPS = ['paru'];
function applyAurAvailability() {
    const key = (typeof window.targetOS === 'function') ? window.targetOS() : 'arch';
    const hasModel = window.osHasInstallModel ? window.osHasInstallModel(key) : (key === 'arch');
    const model = window.osInstallModel
        ? window.osInstallModel(hasModel ? key : 'arch') : null;
    const aur = !model || model.aur !== false;
    const label = (window.OS_META && window.OS_META[key]) ? window.OS_META[key].label : 'this system';

    AUR_ONLY_APPS.forEach(function (value) {
        const box = document.querySelector('input[name="post_apps"][value="' + value + '"]');
        if (!box) return;
        const card = box.closest('.app-card');
        box.disabled = !aur;
        if (!aur) box.checked = false;
        if (!card) return;
        /* The same treatment a libre-blocked card gets: visibly inert rather
           than merely dimmed, so it does not read as simply unticked. */
        card.classList.toggle('app-disabled', !aur);
        let note = card.querySelector('.app-unavailable-note');
        if (!aur) {
            if (!note) {
                note = document.createElement('span');
                note.className = 'app-desc app-unavailable-note';
                card.appendChild(note);
            }
            note.textContent = 'Not available: ' + label + ' has no AUR.';
        } else if (note) {
            note.remove();
        }
    });
}

document.addEventListener('DOMContentLoaded', applyGeneratorOs);
document.addEventListener('unix:os-changed', applyGeneratorOs);
