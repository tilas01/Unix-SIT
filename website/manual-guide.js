/* ============================================================================
   manual-guide.js — turns answers into a guide and a script.
   ----------------------------------------------------------------------------
   Two exports, from one set of answers:

     buildManualGuide(state)  → markdown: every command with the reason for it
     buildManualScript(state) → bash: the same commands, in order, runnable

   They are built from the same branch logic so they cannot disagree, which is
   the whole point — a walkthrough that explains one thing while the script does
   another is worse than either alone.

   Commands follow the Arch Wiki installation guide. Where this and the Arch
   Wiki differ, the Arch Wiki is right and this is a bug.
   ========================================================================= */

'use strict';

(function () {

    function esc(v) { return String(v === undefined || v === null ? '' : v); }
    function has(list, v) { return Array.isArray(list) && list.indexOf(v) !== -1; }

    /* Package sets, kept next to each other so the markdown and the script
       cannot install different things. */
    const FONT_PKG = {
        'jetbrains-mono-nerd': 'ttf-jetbrains-mono-nerd',
        'fira-code-nerd': 'ttf-firacode-nerd',
        'cascadia-code': 'ttf-cascadia-code-nerd',
        'iosevka': 'ttc-iosevka',
        'hack': 'ttf-hack-nerd'
    };

    /* Palettes ship as themes for the terminal, editor and prompt. Only the
       ones actually in the repositories or the AUR are listed. */
    const PALETTE_INFO = {
        'tokyo-night':      { pkg: null, repo: 'https://github.com/folke/tokyonight.nvim',        label: 'Tokyo Night' },
        'catppuccin-mocha': { pkg: null, repo: 'https://github.com/catppuccin/catppuccin',        label: 'Catppuccin Mocha' },
        'gruvbox-dark':     { pkg: null, repo: 'https://github.com/morhetz/gruvbox',              label: 'Gruvbox Dark' },
        'nord':             { pkg: null, repo: 'https://www.nordtheme.com/',                     label: 'Nord' },
        'dracula':          { pkg: null, repo: 'https://draculatheme.com/',                       label: 'Dracula' },
        'rose-pine':        { pkg: null, repo: 'https://rosepinetheme.com/',                      label: 'Rosé Pine' },
        'everforest':       { pkg: null, repo: 'https://github.com/sainnhe/everforest',           label: 'Everforest' }
    };

    const LIBRE_BLOCKED = ['steam', 'discord'];

    /* DNS upstreams now live in dns-providers.js, shared with the Dynamic
       Generator. They were private to this file, which is exactly why the
       generator had no encrypted DNS at all — the table and the emission simply
       did not exist on that side. One table, two readers. */
    const DNS_PROVIDERS =
        (typeof window !== 'undefined' && window.DnsProviders && window.DnsProviders.table) || {};



    /* ── Derived facts ──────────────────────────────────────────────────── */

    function facts(s) {
        const arm = s.arch === 'aarch64';
        const enc = s.encryption && s.encryption !== 'none';
        const disk = esc(s.disk) || '/dev/CHANGE_ME';
        /* nvme0n1 partitions are nvme0n1p1; sda partitions are sda1. mmcblk
           follows the nvme rule. Getting this wrong is the classic way a
           generated script targets a device that does not exist. */
        const sep = /(\d|nvme\d+n\d+|mmcblk\d+|loop\d+)$/.test(disk) &&
                    /(nvme|mmcblk|loop)/.test(disk) ? 'p' : '';
        const dual = s.dualboot && s.dualboot !== 'none';
        /* Whether the other operating system's EFI partition is being shared.
           Absent means shared, which is what this guide did before the question
           existed — so a config saved earlier produces the same output.

           Sharing is the common advice and it works, but it puts both systems'
           loaders on one partition, and anything measuring that partition then
           sees the other system's updates as changes. That is why the question
           exists rather than the answer being assumed. */
        const espShared = dual && s.dualboot_esp_mode !== 'separate';
        /* Going on first means the other system is not there yet: nothing to
           share, and no existing bootloader to hand the menu to. Forced here as
           well as gated in the question, because answers can arrive from a
           saved configuration rather than from the screen. */
        const dualFirst = dual && s.dualboot_order === 'first';
        return {
            espShared: espShared && !dualFirst,
            dualFirst: dualFirst,
            /* Which bootloader draws the menu. Absent means this system's,
               which is what this guide did before the question existed. */
            dualOwner: dualFirst ? 'this' : (s.dualboot_owner || 'this'),
            dualDefault: s.dualboot_default || 'this',
            arm: arm,
            enc: enc,
            disk: disk,
            esp: dual ? esc(s.dualboot_esp) : disk + sep + '1',
            root: disk + sep + (dual ? '2' : '2'),
            rootDev: enc ? '/dev/mapper/cryptroot' : disk + sep + '2',
            dual: dual,
            libre: s.libre === 'yes',
            btrfs: s.filesystem === 'btrfs',
            gui: s.desktop && s.desktop !== 'none',
            dusky: s.desktop === 'dusky'
        };
    }

    /* ── Package list ───────────────────────────────────────────────────── */

    function basePackages(s, f) {
        const pkgs = ['base', 'linux-firmware', 'sudo', 'vim', 'man-db', 'man-pages', 'texinfo'];
        (s.kernels || ['linux']).forEach(k => pkgs.push(k, k + '-headers'));
        if (f.btrfs) pkgs.push('btrfs-progs');
        if (s.filesystem === 'xfs') pkgs.push('xfsprogs');
        if (f.enc) pkgs.push('cryptsetup');
        if (!f.arm && !f.libre && s.microcode && s.microcode !== 'none') pkgs.push(s.microcode);
        if (s.network === 'networkmanager') pkgs.push('networkmanager');
        if (s.network === 'systemd-networkd') pkgs.push('iwd');
        if (s.network === 'iwd') pkgs.push('iwd');
        if (s.bootloader === 'grub' || (f.arm && s.arm_boot === 'efi-arm')) pkgs.push('grub', 'efibootmgr');
        if (s.bootloader === 'uki') pkgs.push('sbctl', 'efibootmgr');
        if (s.bootloader === 'systemd-boot') pkgs.push('efibootmgr');
        if (s.swap === 'zram') pkgs.push('zram-generator');
        if (s.shell === 'zsh') pkgs.push('zsh');
        if (s.shell === 'fish') pkgs.push('fish');
        return pkgs;
    }

    function desktopPackages(s, f) {
        const p = [];
        if (!f.gui) return p;
        if (s.desktop === 'dusky' || s.desktop === 'hyprland') {
            p.push('hyprland', 'waybar', 'wofi', 'xdg-desktop-portal-hyprland',
                   'qt5-wayland', 'qt6-wayland', 'polkit-kde-agent');
        }
        if (s.desktop === 'dwm') p.push('xorg-server', 'xorg-xinit', 'libx11', 'libxft', 'libxinerama');
        if (s.desktop === 'gnome') p.push('gnome', 'gdm');
        if (s.desktop === 'kde') p.push('plasma-meta', 'sddm', 'konsole');
        if (s.display_server === 'xorg' && s.desktop !== 'dwm') p.push('xorg-server');
        if (s.audio === 'pipewire') p.push('pipewire', 'pipewire-pulse', 'pipewire-alsa', 'wireplumber');
        if (s.font && FONT_PKG[s.font]) p.push(FONT_PKG[s.font]);
        // Ricing toolkit. Each choice maps to the Wayland or Xorg package
        // depending on the display server, so the guide never tells a Wayland
        // user to install an X-only tool.
        const wl = s.display_server !== 'xorg';
        const RICE = {
            rofi:       wl ? 'wofi' : 'rofi',
            waybar:     wl ? 'waybar' : 'polybar',
            dunst:      wl ? 'mako' : 'dunst',
            wallpaper:  wl ? 'hyprpaper' : 'feh',
            picom:      'picom',
            lockscreen: wl ? 'hyprlock' : 'swaylock',
            idle:       wl ? 'hypridle' : 'swayidle',
            clipboard:  wl ? 'cliphist' : 'clipman',
            screenshot: wl ? 'grim slurp' : 'flameshot'
        };
        (s.ricing || []).forEach(r => {
            if (RICE[r]) RICE[r].split(' ').forEach(pkg => p.push(pkg));
        });
        return p;
    }

    /* Applications the reader ticked, turned into packages.
     *
     * The tick and the package are not the same thing and never were: one
     * `bluetooth` is `bluez` and `bluez-utils`, one `pipewire` is four
     * packages, and `obs` is `obs-studio`. This side used to pass the tick
     * straight through as a package name, which worked only because its list
     * happened to hold thirteen ids that were also package names. The
     * catalogue in os-install.js is what knows the difference.
     *
     * Repository and AUR are separated here rather than at the point of
     * printing, because they are different commands with different risks, and
     * a system with no AUR has to be told which of its choices it cannot have.
     */
    function postPackages(s, f) {
        let apps = (s.apps || []).slice();
        if (f.libre) apps = apps.filter(a => LIBRE_BLOCKED.indexOf(a) === -1);

        const cat = (typeof window !== 'undefined' && window.appPkgs) ? window : null;
        const aurIds = cat ? cat.appAurIds(apps) : [];
        const repoIds = apps.filter(a => aurIds.indexOf(a) === -1);

        const extra = [];
        if (s.firewall === 'ufw') extra.push('ufw');
        if (s.firewall === 'nftables') extra.push('nftables');
        if (s.snapshots === 'snapper') extra.push('snapper', 'snap-pac');
        if (s.snapshots === 'timeshift') extra.push('timeshift');
        return {
            // The ids, for anything that needs to talk about the choice.
            ids: apps,
            aurIds: aurIds,
            // The packages, which is what an install command actually takes.
            apps: cat ? cat.appPkgs(repoIds) : repoIds,
            aur: cat ? cat.appPkgs(aurIds) : aurIds,
            extra: extra
        };
    }

    /* ── Systems that ship an image rather than an installer ─────────────────
       Raspberry Pi OS is the first of these and the reason this exists. There
       is no live environment to boot, nothing to partition and no base system
       to bootstrap: the card is written from a published image that already
       holds the filesystem, and the first shell you get is on the running
       board. Sections 1 to 3 of the ordinary guide have nothing to describe,
       so they are replaced rather than translated.

       Everything from section 4 onward is shared, because by then both kinds
       of install are the same thing — a booted system being configured. */
    function imagedInstall(L, s, f, M, os) {
        const im = M.imaged;
        const boot = M.espMount;

        L.push('## 1. Write the image to the card');
        L.push('');
        L.push('There is no installer to boot. ' + os.label + ' is published as a');
        L.push('complete filesystem image, and installing it means writing that image to');
        L.push('an SD card or a USB disk from another machine. Nothing is partitioned and');
        L.push('nothing is bootstrapped: the first thing that runs is the finished system.');
        L.push('');
        L.push('1. Get the image from <' + im.imagesUrl + '>.');
        L.push('2. Verify it before you write it. The');
        L.push('   [verifier](https://tilas01.github.io/Unix-SIT/iso-verify.html) will');
        L.push('   hash it in your browser.');
        L.push('3. Write it with **' + im.tool + '** (<' + im.toolUrl + '>), which is also');
        L.push('   where the settings below are entered.');
        L.push('');
        L.push('> **Everything on the card is destroyed.** The imaging tool does not ask');
        L.push('> twice either, and a card reader that shows up as your system disk has');
        L.push('> ruined somebody\'s afternoon before. Check the device it names.');
        L.push('');

        /* The Imager's advanced options are the supported substitute for a
           chroot. Saying so plainly matters: a reader who has installed Arch
           will look for the step where they set a hostname and a user, and on
           this system that step happens before the card ever boots. */
        L.push('### Set it up before the first boot');
        L.push('');
        L.push('Open the advanced options in ' + im.tool + ' (the gear, or');
        L.push('<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and fill in:');
        L.push('');
        L.push('| Setting | Value |');
        L.push('|---|---|');
        L.push('| Hostname | `' + esc(s.hostname) + '` |');
        L.push('| Username | `' + esc(s.username) + '` |');
        L.push('| Password | one you choose now |');
        L.push('| SSH | ' + (has(s.apps, 'openssh')
                    ? 'enabled, **public-key only**' : 'leave off unless you need it') + ' |');
        L.push('| Locale | `' + esc(s.locale) + '`, keyboard `' + esc(s.keymap) + '` |');
        L.push('| Time zone | `' + esc(s.timezone) + '` |');
        L.push('');
        L.push('This is the step a chroot does on other systems. It writes');
        L.push('`' + im.firstBoot.userconf + '` and, if you asked for it, `' +
               im.firstBoot.ssh + '` onto the boot partition, and the first boot reads');
        L.push('them and then deletes them.');
        L.push('');
        L.push('> **There is no default password to fall back on.** Raspberry Pi OS has');
        L.push('> shipped without the old `pi`/`raspberry` account since 2022 precisely');
        L.push('> because everyone knew it. If you skip the user here the board boots to a');
        L.push('> setup wizard on the screen, which is fine with a monitor attached and a');
        L.push('> dead end without one.');
        L.push('');
        if (has(s.apps, 'openssh')) {
            L.push('> You asked for SSH. Enable it with a **public key**, not a password —');
            L.push('> a Pi is usually the machine left plugged in somewhere, and a');
            L.push('> password-authenticated SSH port on a board nobody looks at is the');
            L.push('> single most attacked thing in this guide.');
            L.push('');
        }

        L.push('## 2. First boot');
        L.push('');
        L.push('Put the card in, power the board, and log in as `' + esc(s.username) + '`.');
        L.push('');
        L.push('```bash');
        L.push('# The image is sized for the smallest supported card, so the root');
        L.push('# filesystem does not fill the one you actually used.');
        L.push('sudo ' + im.expand);
        L.push('');
        L.push('# Everything published since the image was built.');
        L.push('sudo ' + M.upgrade);
        L.push('```');
        L.push('');
        L.push('> Expand before you install anything. A card that fills up part way');
        L.push('> through an upgrade leaves dpkg half-configured, and recovering from that');
        L.push('> on a headless board is worse than starting again.');
        L.push('');
        if (f.enc) {
            /* The reader asked for encryption on a system that does not offer
               it. Saying "not covered" and stopping would be the honest
               minimum; saying what it would actually take is better, and
               pretending the Arch steps apply would be the defect. */
            L.push('> [!CAUTION]');
            L.push('> **You chose full-disk encryption, and this system does not do it.**');
            L.push('> There is no installer option for it and the published image boots');
            L.push('> unencrypted. It is possible — ' + M.fde.mechanism + ', with the root');
            L.push('> filesystem copied into a new encrypted volume and the initramfs');
            L.push('> rebuilt to unlock it — but that is a rebuild of the system after the');
            L.push('> fact, not a setting, and the steps elsewhere in this project are for');
            L.push('> a machine that was encrypted before anything was written to it.');
            L.push('>');
            L.push('> **They do not transfer, and this guide will not pretend they do.**');
            L.push('> The board also has no way to enter a passphrase without a keyboard');
            L.push('> and a screen attached, so a headless Pi needs a network unlock as');
            L.push('> well. Treat it as a separate project and read the authority first:');
            L.push('> <' + M.authority + '>.');
            L.push('');
        }

        L.push('## 3. Configure the board');
        L.push('');
        L.push('`' + im.configure + '` is the supported way to change the things that are');
        L.push('specific to this hardware. It edits the same files by hand underneath.');
        L.push('');
        L.push('```bash');
        L.push('sudo ' + im.configure + '');
        L.push('#   System Options   hostname, boot behaviour, network at boot');
        L.push('#   Interface Options SSH, SPI, I2C, the camera');
        L.push('#   Performance      GPU memory split, overclock');
        L.push('#   Localisation     locale, time zone, keyboard, wifi country');
        L.push('```');
        L.push('');
        L.push('> The wifi country is not cosmetic. The radio stays disabled until it is');
        L.push('> set, because the legal channel list depends on it, and "wifi does not');
        L.push('> work on a new Pi" is this setting more often than it is anything else.');
        L.push('');
        L.push('The boot partition is mounted at `' + boot + '`, and it is a plain FAT');
        L.push('partition rather than an EFI system partition. Two files on it decide how');
        L.push('the board starts:');
        L.push('');
        L.push('```bash');
        L.push('cat ' + boot + '/config.txt      # firmware settings, one per line');
        L.push('cat ' + boot + '/cmdline.txt     # the kernel command line, all on ONE line');
        L.push('```');
        L.push('');
        L.push('> `cmdline.txt` is a single line. A newline in it is not a formatting');
        L.push('> nicety — everything after the first line is ignored, so an edit that');
        L.push('> looks tidy silently drops half the kernel command line.');
        L.push('');
    }

    /* ── Markdown ───────────────────────────────────────────────────────── */

    function buildManualGuide(s) {
        const f = facts(s);
        const L = [];
        const answered = Object.keys(s).length > 0;

        /* Reads the OS variable rather than hard-coding "Arch". Resolves to
           Arch when unset, so a skipped selection produces exactly the guide
           this project produced before the selector existed. */
        const OSM = (typeof window !== 'undefined' && window.OS_META) ||
                    (typeof OS_META !== 'undefined' ? OS_META : null);
        const osKey = (OSM && s.os && OSM[s.os]) ? s.os : 'arch';
        const os = OSM ? OSM[osKey] : { label: 'Arch Linux', complete: true };

        /* How this system installs, from os-install.js.

           Systems whose emitters are not written yet have no model. They borrow
           Arch's commands rather than throwing, because throwing would take the
           read-only preview down with it — but the guide then says, in as many
           words, that the commands below are Arch's. A reader cannot reach one
           of these anyway: setTargetOS() refuses to select an unfinished
           system. The os-permutations gate generates all of them precisely to
           measure how much borrowed Arch is left. */
        const hasModel = (typeof window !== 'undefined' && window.osHasInstallModel)
            ? window.osHasInstallModel(osKey) : (osKey === 'arch');
        const modelKey = hasModel ? osKey : 'arch';
        const M = (typeof window !== 'undefined' && window.osInstallModel)
            ? window.osInstallModel(modelKey) : null;
        const I = (typeof window !== 'undefined' && window.osInitOf)
            ? window.osInitOf(modelKey, s) : null;

        L.push('# ' + os.label + ' — your manual install guide');
        L.push('');
        if (!answered) {
            L.push('_Answer the questions to build a guide. Every command that appears');
            L.push('here comes with the reason it is there._');
            return L.join('\n');
        }

        /* Work-in-progress banner. Deliberately the first thing after the
           title, deliberately a CAUTION block, and deliberately repeated in the
           generated script's header — someone who skims the page and runs the
           script must still meet it. These scripts repartition disks. */
        if (os.complete === false) {
            L.push('> [!CAUTION]');
            L.push('> **🚧 The ' + os.label + ' guide is a work in progress and is NOT');
            L.push('> ready to install from.** It is published so it can be read and');
            L.push('> reviewed, not run. Commands may be missing, wrong, or in the wrong');
            L.push('> order, and running them could destroy data without producing a');
            L.push('> working system.');
            L.push('>');
            L.push('> **Use the Arch Linux guide for an actual install.** It is the only');
            L.push('> complete one.');
            L.push('>');
            L.push('> If you know ' + os.label + ' and want to help, corrections are very');
            L.push('> welcome: <https://github.com/tilas01/Unix-SIT/issues>');
            L.push('');
            /* Say which part is missing, not merely that something is. "This is
               incomplete" leaves a reader guessing which lines to distrust;
               "every command below is Arch's" tells them it is all of them. */
            if (!hasModel) {
                L.push('> **Specifically: the commands below are Arch\'s, not ' + os.label +
                       '\'s.**');
                L.push('> ' + os.label + ' uses ' + (os.pkg || 'a different package manager') +
                       ' and ' + (os.init || 'a different init system') + ', and its ' +
                       'installer');
                L.push('> works differently again. Until its own commands are written, this');
                L.push('> page shows the Arch ones under an ' + os.label + ' heading so the');
                L.push('> structure can be reviewed. Do not run them.');
                L.push('');
            }
            L.push('> The authority for ' + os.label + ' is ' + os.docsName + ': <' +
                   os.docs + '>. Where this guide and that disagree, that is right and');
            L.push('> this is a bug worth reporting.');
            L.push('');
        }

        L.push('Generated by the [*nix Install Guides manual walkthrough](https://tilas01.github.io/Unix-SIT/manual.html).');
        L.push('Cross-check anything you are unsure about against the');
        L.push('[Arch Wiki installation guide](https://wiki.archlinux.org/title/Installation_guide) —');
        L.push('it is the authority, and where it and this disagree it is right.');
        L.push('');
        L.push('> **Read this before running any of it.** The partitioning commands are');
        L.push('> aimed at `' + f.disk + '` and will destroy everything on it. They do not');
        L.push('> ask twice.');
        L.push('');

        /* Summary table — what you chose, at a glance. */
        L.push('## Your choices');
        L.push('');
        L.push('| | |');
        L.push('|---|---|');
        const row = (k, v) => { if (v !== undefined && v !== null && v !== '') L.push('| **' + k + '** | ' + (Array.isArray(v) ? v.join(', ') : v) + ' |'); };
        row('Architecture', s.arch);
        row('Board', s.board);
        row('Alongside', s.dualboot === 'none' ? 'nothing — whole disk' : s.dualboot);
        row('Disk', s.disk);
        row('Encryption', s.encryption);
        row('Filesystem', s.filesystem);
        row('Swap', s.swap);
        row('Firmware', s.firmware);
        row('Bootloader', s.bootloader || s.arm_boot);
        row('Secure Boot', s.secureboot);
        row('Kernels', s.kernels);
        row('Microcode', s.microcode);
        row('Mirror country', s.mirror_country === 'auto' ? 'auto (fastest worldwide)' : s.mirror_country);
        row('Mirror protocol', s.mirror_https === 'no' ? 'HTTP + HTTPS' : 'HTTPS only');
        row('Desktop', s.desktop);
        row('Display server', s.display_server);
        row('Ricing toolkit', s.ricing);
        row('Font', s.font);
        row('Palette', s.palette);
        row('Shell', s.shell);
        row('Network', s.network);
        row('Firewall', s.firewall);
        row('Snapshots', s.snapshots);
        row('Security tools', s.security_tools);
        row('Duress PINs', s.duress_pins);
        row('Libre only', s.libre);
        L.push('');

        if (f.dusky) {
            L.push('> **Dusky is preconfigured.** It fixes the compositor (Hyprland on');
            L.push('> Wayland), the shell (zsh), the font (JetBrains Mono Nerd) and the');
            L.push('> palette (Tokyo Night). Those questions were locked rather than');
            L.push('> silently overridden, so you could see the cost of the choice.');
            L.push('> Walkthrough video: <https://www.youtube.com/watch?v=6bnLBs_j8Kk>');
            L.push('');
        }

        /* ── 0. Before you boot ── */
        L.push('## 0. Before you start');
        L.push('');
        L.push('1. **Verify the image.** Hash it, and get the checksum from a host other');
        L.push('   than the one that served the image — a server that lies about the');
        L.push('   image can hand you a checksum that matches the lie.');
        L.push('   [Verifier](https://tilas01.github.io/Unix-SIT/iso-verify.html).');
        if (M && M.eeprom) {
            /* A supervisor password and a boot order are things a PC firmware
               setup has and this board does not. Printing that advice here
               would send a reader looking for a menu that is not there, and
               leave the thing that does matter - the bootloader in the EEPROM -
               unmentioned. */
            L.push('2. **Update the bootloader in the EEPROM.** It runs before anything');
            L.push('   you control and it is not a setup menu: there is no supervisor');
            L.push('   password and no boot order to lock, so keeping the firmware current');
            L.push('   and turning on verified boot is what takes its place. Section 5.');
        } else {
            L.push('2. **Lock the firmware down.** Update it, set a supervisor password,');
            L.push('   disable USB and network boot. Without a supervisor password every');
            L.push('   other setting is one unlocked menu away from being undone.');
        }
        L.push('3. **Back up anything you cannot lose** — not to the ' +
               ((M && M.imaged) ? 'card' : 'disk') + ' below.');
        if (f.dual) {
            L.push('4. **Dual boot preparation**, because the other system is staying:');
            if (s.dualboot === 'windows') {
                L.push('   - In Windows, as administrator: `powercfg /h off`. Fast Startup');
                L.push('     leaves NTFS hibernated, and resizing it in that state corrupts it.');
                L.push('   - Check whether BitLocker is even on: `manage-bde -status`.');
                L.push('     Recent Windows turns on **Device Encryption** by itself on');
                L.push('     machines that qualify, Home editions included, and puts the');
                L.push('     recovery key in your Microsoft account rather than showing it');
                L.push('     to you. Anything other than "Fully Decrypted" means it is on.');
                L.push('   - **Write the recovery key down first, somewhere that is not this');
                L.push('     machine** — <https://aka.ms/myrecoverykey> if it was never shown');
                L.push('     to you. Changing the boot configuration changes the TPM');
                L.push('     measurements, and Windows will ask for it.');
                L.push('   - Suspend BitLocker: `manage-bde -protectors -disable C:`.');
                L.push('     Without `-RebootCount` it stays suspended until you say');
                L.push('     otherwise. `-RebootCount 2` means two boots and no more, so an');
                L.push('     install that needs a third re-arms BitLocker partway through.');
                L.push('   - Full **Restart**, not Shut down, before booting the installer.');
                if (s.secureboot && s.secureboot !== 'none') {
                    /* Two features this project offers, pointed at the same
                       measurement. Enrolling keys changes PCR 7, which is one of
                       the values BitLocker seals to, so the collision is certain
                       rather than possible — worth saying before it happens. */
                    L.push('   - You chose to enrol your own Secure Boot keys, which changes');
                    L.push('     **PCR 7** — one of the measurements BitLocker seals its key');
                    L.push('     to. Windows will ask for the recovery key afterwards. That is');
                    L.push('     expected. Re-enable protection once, after Windows has booted');
                    L.push('     cleanly, so it re-seals against the new measurements.');
                }
            } else if (f.espShared) {
                L.push('   - Note the existing EFI system partition: `' + esc(s.dualboot_esp) + '`.');
                L.push('     It is **mounted, never formatted** — formatting it deletes the');
                L.push('     other system\'s bootloader.');
            } else {
                L.push('   - You are giving this system its own EFI partition, so the other');
                L.push('     system\'s is never touched. Leave 512 MiB of free space for it');
                L.push('     when you shrink the existing partition.');
            }
        }
        L.push('');

        /* ── 1 to 3, or the image ────────────────────────────────────────
           A system that publishes a filesystem image has no installer to boot,
           nothing to partition and no base system to bootstrap, so these three
           sections are replaced rather than reworded. Everything from section
           4 down is shared: by then both kinds of install are the same thing,
           a booted system being configured. */
        if (M && M.imaged) {
            imagedInstall(L, s, f, M, os);
        } else {

            /* ── 1. Boot ── */
            L.push('## 1. Boot the installer and get a network');
            L.push('');
            L.push('```bash');
            if (s.keymap && s.keymap !== 'us') L.push('loadkeys ' + s.keymap);
            if (!f.arm) L.push('ls /sys/firmware/efi && echo UEFI   # confirms firmware mode');
            L.push('');
            L.push('# Wireless, if you need it:');
            L.push('iwctl station wlan0 connect YOUR_SSID');
            L.push('');
            L.push('ping -c3 archlinux.org');
            L.push('timedatectl set-ntp true');
            L.push('```');
            L.push('');
            if (f.arm) {
                L.push('> **ARM is different here.** Arch Linux ARM does not ship a bootable');
                L.push('> installer ISO. You prepare the storage from another machine and');
                L.push('> extract a per-board rootfs tarball onto it, then boot into the');
                L.push('> installed system. Steps 2 and 3 below run on the *other* machine.');
                L.push('> Mirror selection below is Arch-proper only; Arch Linux ARM uses its');
                L.push('> own mirror list at /etc/pacman.d/mirrorlist. See');
                L.push('> <https://archlinuxarm.org/platforms> for your board.');
                L.push('');
            } else if (M && M.family === 'gentoo') {
                /* Gentoo has no reflector and no /etc/pacman.d/mirrorlist. Mirrors
                   are a make.conf variable, chosen with mirrorselect, and the
                   package *tree* is a separate thing again from the mirrors that
                   serve distfiles. */
                const httpsOnlyG = s.mirror_https !== 'no';
                L.push('### Pick fast package mirrors');
                L.push('');
                L.push('```bash');
                L.push('emerge --verbose --oneshot app-portage/mirrorselect');
                L.push('');
                L.push('# Interactive: pick from the list, closest first.');
                L.push('mirrorselect -i -o >> /mnt/gentoo/etc/portage/make.conf');
                L.push('');
                L.push('# Or automatic: the ' +
                       (httpsOnlyG ? 'ten fastest HTTPS mirrors' : 'ten fastest mirrors') + '.');
                L.push('mirrorselect -s10' + (httpsOnlyG ? ' -H' : '') +
                       ' -o >> /mnt/gentoo/etc/portage/make.conf');
                L.push('```');
                L.push('');
                L.push('> This writes a `GENTOO_MIRRORS=` line. Check it before you rely on');
                L.push('> it — `mirrorselect` appends, so running it twice leaves two, and');
                L.push('> the later one wins in a way that is easy to miss.');
                L.push('');
                if (!httpsOnlyG) {
                    L.push('> You allowed plain HTTP mirrors. Distfiles are verified against the');
                    L.push('> digests in the tree, so this is not an integrity risk — but anyone');
                    L.push('> on the path can see which packages you build. HTTPS hides that.');
                    L.push('');
                }
                L.push('The package tree itself is separate from these mirrors and is synced');
                L.push('in the chroot below, with `emerge-webrsync`.');
                L.push('');
            } else {
                // Mirror selection with reflector. Only on Arch-proper (x86_64):
                // Arch Linux ARM has a separate mirror system.
                const httpsOnly = s.mirror_https !== 'no';
                const country = s.mirror_country && s.mirror_country !== 'auto'
                    ? s.mirror_country : null;
                L.push('### Pick fast package mirrors');
                L.push('');
                L.push('```bash');
                L.push('pacman -Sy --noconfirm reflector');
                const parts = ['reflector'];
                if (country) parts.push('--country ' + country);
                parts.push('--age 12');            // synced in the last 12 hours
                parts.push('--latest 20');         // the 20 most-recently-synced
                if (httpsOnly) parts.push('--protocol https');
                parts.push('--sort rate');         // then rank those by download speed
                parts.push('--save /etc/pacman.d/mirrorlist');
                // Wrap the reflector line for readability rather than one long line.
                L.push(parts.join(' \\\n    '));
                L.push('');
                L.push('# --sort rate downloads from each candidate to measure real speed,');
                L.push('# so this takes a minute. --age 12 and --latest 20 keep only mirrors');
                L.push('# that are both fresh and fast.' +
                       (httpsOnly ? ' --protocol https keeps it to encrypted mirrors.' : ''));
                L.push('```');
                L.push('');
                if (!httpsOnly) {
                    L.push('> You allowed HTTP mirrors. Package **contents** are still verified');
                    L.push('> by pacman\'s signatures, so this is not an integrity risk — but');
                    L.push('> anyone on the path can see which packages you install. HTTPS');
                    L.push('> hides that.');
                    L.push('');
                }
            }

            /* ── 2. Partition ── */
            L.push('## 2. Partition `' + f.disk + '`');
            L.push('');
            L.push('```bash');
            L.push('lsblk                       # identify the disk by size and model. Twice.');
            L.push('```');
            L.push('');
            if (f.dual && f.dualFirst) {
                L.push('This system is going on **first**, so nothing needs shrinking. Give it a');
                L.push('fixed size and leave the rest of the disk unpartitioned — the other');
                L.push('installer will find that free space and claim it.');
                L.push('');
                L.push('> Leave the room now. Taking it back later means shrinking a filesystem');
                L.push('> that is full of your data, which is the work this ordering exists to');
                L.push('> avoid.');
                L.push('');
                L.push('```bash');
                L.push('gdisk ' + f.disk);
                L.push('#   n → 1 → +512M → type ef00        # this system\'s own ESP');
                L.push('#   n → 2 → a size you choose → type 8300');
                L.push('#   w → write');
                L.push('#');
                L.push('# Do NOT give partition 2 the rest of the disk. Whatever is left');
                L.push('# unpartitioned is what the other system gets.');
                L.push('```');
                L.push('');
            } else if (f.dual) {
                L.push('You are keeping another operating system, so you are **adding** a');
                L.push('partition rather than repartitioning. Shrink the existing one from');
                L.push('that system\'s own tools first — Windows Disk Management, or GParted');
                L.push('for Linux — then create one Linux partition in the free space.');
                L.push('');
                L.push('```bash');
                L.push('gdisk ' + f.disk);
                if (f.espShared) {
                    L.push('#   n → next free number → rest of free space → type 8300');
                    L.push('#   w → write');
                    L.push('#');
                    L.push('# Do NOT touch ' + esc(s.dualboot_esp) + '. That is the existing ESP and it is shared.');
                    L.push('```');
                    L.push('');
                    L.push('> You are sharing the other system\'s EFI partition. It is **mounted,');
                    L.push('> never formatted** — formatting it deletes that system\'s bootloader.');
                    if (has(s.security_tools, 'anti-evil-maid')) {
                        /* The reader picked a tool whose whole job is noticing
                           changes to this partition, and then chose to share it
                           with a system that rewrites it unpredictably. Both are
                           legitimate; the combination needs saying out loud. */
                        L.push('>');
                        L.push('> **You also selected anti-evil-maid.** It baselines this partition');
                        L.push('> and reports changes, and the other system writes here too — so');
                        L.push('> its updates will read as tampering. Re-baseline with');
                        L.push('> `anti-evil-maid --setup` after each one, or the alerts stop');
                        L.push('> meaning anything. A separate EFI partition avoids this entirely.');
                    }
                    L.push('');
                } else {
                    L.push('#   n → next free number → +512M → type ef00   (this system\'s ESP)');
                    L.push('#   n → next free number → rest of free space → type 8300');
                    L.push('#   w → write');
                    L.push('#');
                    L.push('# Leave the other system\'s ESP alone. This makes a second one.');
                    L.push('```');
                    L.push('');
                    L.push('> The new partition is formatted with the others below. Check its');
                    L.push('> path twice before you get there: `mkfs.fat` aimed at the *other*');
                    L.push('> system\'s ESP destroys its bootloader, which is the exact failure a');
                    L.push('> second partition exists to avoid.');
                    L.push('');
                    L.push('> The UEFI specification allows more than one EFI system partition,');
                    L.push('> and the firmware boots whichever its boot entry names. You pick');
                    L.push('> between the two systems in the firmware boot menu. If your firmware');
                    L.push('> only ever offers the first ESP it finds — a few do — put the');
                    L.push('> bootloaders on the shared one and keep the kernel and initramfs on');
                    L.push('> a separate `/boot`, which keeps the measured files out of the other');
                    L.push('> system\'s reach just as well.');
                    L.push('');
                }
            } else {
                L.push('```bash');
                L.push('gdisk ' + f.disk);
                L.push('#   o → new GPT (destroys the existing table)');
                L.push('#   n → 1 → +' + (s.bootloader === 'uki' ? '1G' : '512M') + ' → type ef00   (EFI system partition)');
                L.push('#   n → 2 → rest        → type 8300   (Linux filesystem)');
                L.push('#   w → write');
                if (s.bootloader === 'uki') {
                    L.push('#');
                    L.push('# 1 GiB rather than 512 MiB: a unified kernel image bundles the kernel');
                    L.push('# and initramfs into one EFI file, and two of those plus a fallback');
                    L.push('# does not fit in 512 MiB.');
                }
                L.push('```');
            }
            L.push('');

            if (f.enc) {
                L.push('### Encrypt');
                L.push('');
                L.push('```bash');
                if (s.encryption === 'luks2') {
                    L.push('cryptsetup luksFormat --type luks2 --pbkdf argon2id ' + f.root);
                } else {
                    L.push('cryptsetup luksFormat --type luks1 ' + f.root);
                    L.push('# LUKS1 uses PBKDF2, not Argon2id: a weak passphrase falls far');
                    L.push('# faster to a GPU. Use a long one.');
                }
                L.push('cryptsetup open ' + f.root + ' cryptroot');
                L.push('```');
                L.push('');
                L.push('> The passphrase you set here is the one standing between a stolen');
                L.push('> machine and every file on it. There is no recovery if you forget it.');
                L.push('');
            }

            L.push('### Format and mount');
            L.push('');
            L.push('```bash');
            /* Keyed on whether the partition is *shared*, not on whether this is a
               dual boot. A second ESP made for this system is ours to format; the
               other system's never is. */
            if (!f.espShared) {
                L.push('mkfs.fat -F32' + (f.dual ? ' -n LINUXESP' : '') + ' ' + f.esp);
            } else {
                L.push('# ' + f.esp + ' is the existing ESP. It is NOT formatted.');
            }
            if (f.btrfs) {
                L.push('mkfs.btrfs -f ' + f.rootDev);
                L.push('');
                L.push('mount ' + f.rootDev + ' /mnt');
                L.push('btrfs subvolume create /mnt/@');
                L.push('btrfs subvolume create /mnt/@home');
                L.push('btrfs subvolume create /mnt/@log');
                L.push('btrfs subvolume create /mnt/@pkg');
                L.push('btrfs subvolume create /mnt/@snapshots');
                L.push('umount /mnt');
                L.push('');
                /* The package cache and the EFI mount point are per-system.
                   Gentoo keeps binary packages in var/cache/binpkgs and mounts the
                   ESP at /efi with /boot on the root filesystem; Arch does neither.
                   A subvolume named after another system's package manager is the
                   small, embarrassing kind of leak this reads as. */
                const cache = (M && M.pkgCache) || 'var/cache/pacman/pkg';
                const espAt = ((M && M.espMount) || '/boot').replace(/^\//, '');
                L.push('O="noatime,compress=zstd:3,space_cache=v2"');
                L.push('mount -o $O,subvol=@          ' + f.rootDev + ' /mnt');
                L.push('mkdir -p /mnt/{home,var/log,' + cache + ',.snapshots,' + espAt + '}');
                L.push('mount -o $O,subvol=@home      ' + f.rootDev + ' /mnt/home');
                L.push('mount -o $O,subvol=@log       ' + f.rootDev + ' /mnt/var/log');
                L.push('mount -o $O,subvol=@pkg       ' + f.rootDev + ' /mnt/' + cache);
                L.push('mount -o $O,subvol=@snapshots ' + f.rootDev + ' /mnt/.snapshots');
                L.push('mount ' + f.esp + ' /mnt/' + espAt);
            } else {
                L.push('mkfs.' + (s.filesystem === 'xfs' ? 'xfs -f' : 'ext4') + ' ' + f.rootDev);
                L.push('mount ' + f.rootDev + ' /mnt');
                L.push('mkdir -p /mnt/boot');
                L.push('mount ' + f.esp + ' /mnt/boot');
            }
            L.push('```');
            L.push('');
            if (f.btrfs) {
                L.push('> `@log` and `@pkg` are separate subvolumes so that rolling back to a');
                L.push('> snapshot does not also roll back your logs — you want those to');
                L.push('> explain what went wrong — or throw away the package cache you are');
                L.push('> about to need.');
                L.push('');
            }

            if (s.swap === 'swapfile') {
                L.push('### Swap file');
                L.push('');
                L.push('```bash');
                if (f.btrfs) {
                    L.push('btrfs subvolume create /mnt/@swap');
                    L.push('mount -o noatime,subvol=@swap ' + f.rootDev + ' /mnt/swap');
                    L.push('btrfs filesystem mkswapfile --size 8G /mnt/swap/swapfile');
                } else {
                    L.push('mkswap -U clear --size 8G --file /mnt/swapfile');
                }
                L.push('```');
                L.push('');
                if (f.enc) {
                    L.push('> The swap file lives inside the encrypted volume, so anything paged');
                    L.push('> out of memory — including keys — is encrypted at rest too.');
                    L.push('');
                }
            }

            /* ── 3. Install ── */
            const base = basePackages(s, f);
            L.push('## 3. Install the base system');
            L.push('');
            if (M && M.family === 'gentoo') {
                /* Not pacstrap with different words. Gentoo's base system is a
                   signed tarball you verify and unpack yourself, and the chroot is
                   assembled by hand because there is no arch-chroot to do it. */
                L.push('Gentoo\'s base system is a **stage3 tarball**, not a package');
                L.push('transaction. You download it, check its signature, and unpack it over');
                L.push('the filesystem you just made.');
                L.push('');
                /* Everything in a ```bash fence is lifted verbatim into the
                   runnable script, so a placeholder has to be valid shell as well
                   as readable. An angle-bracket placeholder is a redirection and
                   makes the whole script unparseable — the fence is not decorative
                   here. A variable that must be filled in, checked before use, is
                   both: it reads as a blank to fill and it fails closed. */
                L.push('```bash');
                L.push('cd /mnt/gentoo');
                L.push('');
                /* The stage3 answer decides the autobuilds directory, and it has to
                   agree with the profile chosen below. Naming the exact path is the
                   difference between "go and find one" and a command they can run. */
                const stage3Dir = M.stage3.dirFor(s.gentoo_stage3);
                L.push('# Pick a mirror:  ' + M.stage3.mirrorList);
                L.push('# Newest tarball under:');
                L.push('#   releases/amd64/autobuilds/' + stage3Dir + '/');
                L.push('STAGE3_URL=""     # paste the full tarball URL here');
                L.push('');
                L.push('if [ -z "$STAGE3_URL" ]; then');
                L.push('    echo "Set STAGE3_URL to the stage3 tarball you chose." >&2');
                L.push('    exit 1');
                L.push('fi');
                L.push('');
                L.push('wget "$STAGE3_URL"');
                L.push('wget "$STAGE3_URL.asc"');
                L.push('');
                L.push(M.stage3.keyImport);
                L.push(M.stage3.verify('stage3-*.tar.xz'));
                L.push('```');
                L.push('');
                L.push('> Do not skip the signature. The tarball becomes every binary on the');
                L.push('> machine, so a substituted one is not a corrupted download — it is a');
                L.push('> system that belongs to somebody else from first boot.');
                L.push('');
                L.push('```bash');
                L.push(M.stage3.unpack('stage3-*.tar.xz'));
                L.push('```');
                L.push('');
                L.push('> `-p` and `--xattrs-include` keep permissions and extended attributes,');
                L.push('> and `--numeric-owner` keeps the ids as they were built rather than');
                L.push('> remapping them to whatever the live environment happens to call');
                L.push('> them. Unpacking without these produces a system that boots and then');
                L.push('> fails in ways that look unrelated to the tarball.');
                L.push('');
                L.push('### Enter the chroot');
                L.push('');
                L.push('```bash');
                M.chrootPrep.forEach(c => L.push(c));
                L.push('');
                L.push(M.chroot);
                M.chrootAfter.forEach(c => L.push(c));
                L.push('```');
                L.push('');
                L.push('> The `--make-rslave` lines matter: without them, unmounting later in');
                L.push('> the live environment can propagate into the mounts you are still');
                L.push('> using.');
                L.push('');
                L.push('### Compile options');
                L.push('');
                /* Every line here is an answer the reader gave. A question that
                   does not reach make.conf is a control wired to nothing. */
                const makeopts = M.makeopts[s.gentoo_makeopts] || M.makeopts.nproc;
                const useLine = M.useSets[s.gentoo_use] !== undefined
                    ? M.useSets[s.gentoo_use] : M.useSets.profile;
                L.push('```bash');
                L.push('cat >> /mnt/gentoo/etc/portage/make.conf <<EOF');
                L.push('COMMON_FLAGS="-O2 -pipe -march=native"');
                L.push('MAKEOPTS="' + makeopts + '"');
                if (useLine) L.push(useLine);
                L.push('EOF');
                L.push('```');
                L.push('');
                if (s.gentoo_makeopts === 'half') {
                    L.push('> Half the cores, because a build job can want around 2 GB of RAM');
                    L.push('> when it links. This is the setting that keeps a laptop usable while');
                    L.push('> it compiles, and keeps a long build away from the OOM killer.');
                    L.push('');
                } else if (s.gentoo_makeopts === '1') {
                    L.push('> One job at a time. Slowest, and the one that always finishes —');
                    L.push('> the right answer after a build has already died on memory once.');
                    L.push('');
                }
                L.push('> `-march=native` builds for the CPU doing the building. Do not use it');
                L.push('> if this disk will be moved to a different machine, or if you intend');
                L.push('> to build packages here for another box.');
                L.push('');
                if (s.gentoo_use === 'minimal') {
                    L.push('> A deliberately minimal USE set is a decision to make now or not at');
                    L.push('> all: turning one of these back **on** later means rebuilding');
                    L.push('> everything that would have depended on it.');
                    L.push('');
                }
                L.push('### Get a package tree, and pick a profile');
                L.push('');
                L.push('```bash');
                L.push('emerge-webrsync');
                L.push('eselect profile list');
                L.push('');
                L.push('# Pick the number matching your stage3 (' +
                       (s.gentoo_stage3 || 'openrc') + ') and the init system you want,');
                L.push('# then run:  eselect profile set NUMBER');
                L.push('```');
                L.push('');
                L.push('> The profile sets the default USE flags, the init system and the');
                L.push('> toolchain defaults. Choosing the systemd profile and then trying to');
                L.push('> run OpenRC — or the reverse — is the most common way a first Gentoo');
                L.push('> install goes wrong.');
                L.push('');
                const gbase = (typeof window !== 'undefined' && window.osPkgNames)
                    ? window.osPkgNames('gentoo', base) : base;
                if (gbase.length) {
                    L.push('```bash');
                    L.push(M.install(gbase));
                    L.push('```');
                    L.push('');
                }
                /* The kernel answer, emitted. Three genuinely different amounts of
                   work, and the manual route carries the warning at the point it
                   matters rather than in a wiki page. */
                L.push('### The kernel');
                L.push('');
                L.push('```bash');
                L.push(M.install(['sys-kernel/linux-firmware']));
                if (s.gentoo_kernel === 'manual') {
                    L.push(M.install(M.kernelPkgs.manual));
                    L.push('cd /usr/src/linux');
                    L.push('make menuconfig');
                    L.push('make -j$(nproc) && make modules_install');
                    L.push('make install');
                } else if (s.gentoo_kernel === 'dist') {
                    L.push(M.install(M.kernelPkgs.dist));
                } else {
                    L.push(M.install(M.kernelPkgs.bin));
                }
                L.push('```');
                L.push('');
                if (s.gentoo_kernel === 'manual') {
                    L.push('> [!CAUTION]');
                    L.push('> A configuration missing the driver for your disk controller, your');
                    L.push('> filesystem, or `dm-crypt` will not boot and will not tell you which');
                    L.push('> one is absent. Check those three before you leave `menuconfig`.');
                    L.push('> If this is a first Gentoo install, take `gentoo-kernel-bin` and');
                    L.push('> come back to this once the machine is up.');
                    L.push('');
                }
                /* Binary packages, as chosen. --getbinpkg is a supported workflow,
                   so it is offered plainly rather than apologised for. */
                if (s.gentoo_binpkgs === 'all') {
                    L.push('> **Binaries preferred wherever published.** Add `--getbinpkg` to the');
                    L.push('> emerge commands below, or set `FEATURES="getbinpkg"` in make.conf');
                    L.push('> to make it the default. Fastest route to a working desktop, and it');
                    L.push('> gives up most of the per-machine optimisation you came here for.');
                    L.push('');
                } else if (s.gentoo_binpkgs === 'big') {
                    L.push('> **Binaries for the big ones only.** Build from source by default and');
                    L.push('> add `--getbinpkg` for the handful nobody sensibly compiles:');
                    L.push('> `www-client/firefox`, `app-office/libreoffice`,');
                    L.push('> `www-client/chromium`, `dev-lang/rust`, `sys-devel/llvm`. Chromium');
                    L.push('> alone can be the better part of a day on a laptop.');
                    L.push('');
                } else if (s.gentoo_binpkgs === 'none') {
                    L.push('> **Everything from source**, which is the reason to be here. Plan the');
                    L.push('> first install as an overnight job, and expect a desktop with a');
                    L.push('> browser to be the long pole by a wide margin.');
                    L.push('');
                }
                const missing = (typeof window !== 'undefined' && window.osPkgUnavailable)
                    ? window.osPkgUnavailable('gentoo', base) : [];
                if (missing.length) {
                    L.push('> Not installed here, because Gentoo has no equivalent package: `' +
                           missing.join('`, `') + '`. The stage3 tarball already provides the');
                    L.push('> base system, and zram is configured through Gentoo\'s own init');
                    L.push('> scripts rather than a generator package.');
                    L.push('');
                }
                L.push('> **fstab is written by hand on Gentoo** — there is no `genfstab`. Use');
                L.push('> `blkid` to get each UUID and write `/etc/fstab` yourself, then read it');
                L.push('> back before you trust it.');
                L.push('');
            } else {
                L.push('```bash');
                L.push('pacstrap -K /mnt \\');
                L.push('    ' + base.join(' ') + '');
                L.push('');
                L.push(M ? M.fstab : 'genfstab -U /mnt >> /mnt/etc/fstab');
                L.push('cat /mnt/etc/fstab          # read it before you trust it');
                L.push(M ? M.chroot : 'arch-chroot /mnt');
                L.push('```');
                L.push('');
            }
            if (f.libre) {
                L.push('> **Libre policy is on**, so no microcode is installed. That leaves');
                L.push('> known CPU errata unmitigated, including some speculative-execution');
                L.push('> issues. That is the trade you asked for; it is worth knowing you');
                L.push('> made it.');
                L.push('');
            }

        }

        /* ── 4. Configure ── */
        const shellPath = s.shell === 'zsh' ? '/bin/zsh'
                        : s.shell === 'fish' ? '/usr/bin/fish' : '/bin/bash';
        if (M && M.imaged) {
            /* Most of this was answered before the card booted, so the section
               is about checking it took rather than doing it again. Debian's
               spellings differ too: the admin group is `sudo`, not `wheel`,
               and the console keymap lives in /etc/default/keyboard rather
               than /etc/vconsole.conf. */
            L.push('## 4. Check what the first boot set');
            L.push('');
            L.push('The imaging tool already answered most of this. Confirm it rather than');
            L.push('setting it twice — and if you skipped the advanced options, this is');
            L.push('where you catch up.');
            L.push('');
            L.push('```bash');
            L.push('hostnamectl                                # hostname, should be ' + esc(s.hostname));
            L.push('timedatectl                                # time zone, should be ' + esc(s.timezone));
            L.push('localectl                                  # locale and keymap');
            L.push('id ' + esc(s.username) + '                 # groups, should include sudo');
            L.push('```');
            L.push('');
            L.push('Anything that is wrong, set here:');
            L.push('');
            L.push('```bash');
            L.push('sudo hostnamectl set-hostname ' + esc(s.hostname));
            L.push('sudo timedatectl set-timezone ' + esc(s.timezone));
            L.push('sudo localectl set-locale LANG=' + esc(s.locale));
            L.push('sudo localectl set-keymap ' + esc(s.keymap));
            L.push('');
            L.push('# /etc/hosts follows the hostname; hostnamectl does not rewrite it.');
            L.push('grep -q "' + esc(s.hostname) + '" /etc/hosts \\');
            L.push('  || echo "127.0.1.1   ' + esc(s.hostname) + '" | sudo tee -a /etc/hosts');
            L.push('```');
            L.push('');
            if (s.shell && s.shell !== 'bash') {
                L.push('```bash');
                L.push('# The shell you chose. It is installed with the rest below, so run');
                L.push('# this after that step rather than before it.');
                L.push('chsh -s ' + shellPath + ' ' + esc(s.username));
                L.push('```');
                L.push('');
            }
            L.push('> **Debian calls the admin group `sudo`, not `wheel`.** Adding yourself');
            L.push('> to `wheel` on this system creates a group nothing consults, and the');
            L.push('> account still cannot use sudo. The user the imager made is already in');
            L.push('> the right one.');
            L.push('');
            L.push('> **root has no password here, and that is on purpose.** Nothing is');
            L.push('> broken: you become root through `sudo`, and an account with no');
            L.push('> password cannot be logged into over the network. Setting one gives an');
            L.push('> attacker something to guess. Leave it.');
            L.push('');
        } else {
        L.push('## 4. Configure, inside the chroot');
        L.push('');
        L.push('```bash');
        L.push('ln -sf /usr/share/zoneinfo/' + esc(s.timezone) + ' /etc/localtime');
        L.push('hwclock --systohc');
        L.push('');
        L.push("sed -i 's/^#" + esc(s.locale) + "/" + esc(s.locale) + "/' /etc/locale.gen");
        L.push('locale-gen');
        L.push('echo "LANG=' + esc(s.locale) + '" > /etc/locale.conf');
        L.push('echo "KEYMAP=' + esc(s.keymap) + '" > /etc/vconsole.conf');
        L.push('');
        L.push('echo "' + esc(s.hostname) + '" > /etc/hostname');
        L.push("cat >> /etc/hosts <<'EOF'");
        L.push('127.0.0.1   localhost');
        L.push('::1         localhost');
        L.push('127.0.1.1   ' + esc(s.hostname) + '.localdomain ' + esc(s.hostname));
        L.push('EOF');
        L.push('');
        L.push('passwd                                     # root password');
        L.push('useradd -m -G wheel -s ' + shellPath + ' ' + esc(s.username));
        L.push('passwd ' + esc(s.username));
        L.push('EDITOR=vim visudo                          # uncomment %wheel ALL=(ALL:ALL) ALL');
        L.push('```');
        L.push('');
        }
        if (f.dual && s.dualboot === 'windows') {
            L.push('> **Turn BitLocker back on once the boot menu is settled.** Boot');
            L.push('> Windows, then `manage-bde -protectors -enable C:` and confirm with');
            L.push('> `manage-bde -status C:` that it reports Protection On. Left');
            L.push('> suspended, the disk still reports as encrypted while its key sits');
            L.push('> unsealed on it, and nothing looks wrong — which is why this step is');
            L.push('> the one that gets skipped.');
            L.push('');
            L.push('> Windows expects the hardware clock in local time and Linux keeps it');
            L.push('> in UTC, so the two will disagree by your offset. `hwclock --systohc`');
            L.push('> above writes UTC, which is the standards-compliant side; set');
            L.push('> `RealTimeIsUniversal` to `DWORD 1` in Windows to match.');
            L.push('');
        }

        if (f.enc && M && M.family === 'gentoo') {
            L.push('### Tell the initramfs about the encryption');
            L.push('');
            L.push('Gentoo has no `mkinitcpio`. The initramfs comes from **dracut**, pulled');
            L.push('in through `sys-kernel/installkernel` with its `dracut` USE flag, and it');
            L.push('is rebuilt automatically whenever a kernel is installed.');
            L.push('');
            L.push('```bash');
            M.dracut.enable.forEach(c => L.push(c));
            L.push('');
            L.push("mkdir -p /etc/dracut.conf.d");
            L.push("cat > /etc/dracut.conf.d/luks.conf <<'EOF'");
            L.push(M.dracut.cryptModules);
            L.push('EOF');
            L.push('```');
            L.push('');
            L.push('> Dracut usually detects an encrypted root on its own, but only if it');
            L.push('> can see the running configuration while it builds. Naming the modules');
            L.push('> makes it independent of that — the failure it prevents is an initramfs');
            L.push('> that cannot open the root volume, which you find out about at the');
            L.push('> first reboot and not before.');
            L.push('');
            L.push('> The kernel command line still needs the volume named, the same way it');
            L.push('> does on Arch. That goes in the bootloader configuration below, not');
            L.push('> here. Authority for all of this is ' + os.docsName + ': <' + os.docs + '>.');
            L.push('');
        } else if (f.enc && M && M.imaged) {
            /* Section 2 has already said, at length, that this system does not
               do full-disk encryption and that the steps elsewhere do not
               transfer. Printing mkinitcpio here would hand it Arch's tool for
               the job it was just told is not on offer. */
            L.push('### The encryption you asked for');
            L.push('');
            L.push('> Covered in section 2, and the short version is that it is not a');
            L.push('> setting on this system. There is no initramfs hook to add here,');
            L.push('> because there is no encrypted volume for one to unlock.');
            L.push('');
        } else if (f.enc) {
            L.push('### Tell the initramfs about the encryption');
            L.push('');
            L.push('```bash');
            L.push('vim /etc/mkinitcpio.conf');
            L.push('# HOOKS=(base systemd autodetect microcode modconf kms keyboard \\');
            L.push('#        sd-vconsole block sd-encrypt filesystems fsck)');
            L.push('#');
            L.push('# sd-encrypt must come BEFORE filesystems, and keyboard before');
            L.push('# sd-encrypt — otherwise you get a passphrase prompt you cannot type');
            L.push('# into, which looks exactly like a broken install.');
            L.push('');
            L.push('mkinitcpio -P');
            L.push('```');
            L.push('');
        }

        /* ── 5. Bootloader ── */
        L.push('## 5. Bootloader');
        L.push('');
        const uuidCmd = 'UUID=$(blkid -s UUID -o value ' + f.root + ')';
        const rootOpts = (f.enc ? 'rd.luks.name=$UUID=cryptroot root=/dev/mapper/cryptroot ' : 'root=UUID=$UUID ') +
                         (f.btrfs ? 'rootflags=subvol=@ ' : '') + 'rw';

        /* A board that boots from its own EEPROM has no bootloader to install.
           Nothing here is UEFI: there is no ESP, no boot manager, no GRUB and
           no Secure Boot chain to enrol keys into. What there is instead is
           firmware that can verify what it loads, and that is worth setting up
           because it runs before anything else on the board does. */
        if (M && M.eeprom) {
            const E = M.eeprom;
            L.push('There is no bootloader to install. The board holds its own in EEPROM,');
            L.push('and that firmware reads `config.txt` and `cmdline.txt` off');
            L.push('`' + M.espMount + '` and starts the kernel directly.');
            L.push('');
            L.push('```bash');
            L.push('# What the board is running now.');
            L.push(E.version);
            L.push('');
            L.push('# Update it. This runs before anything you control, so an out-of-date');
            L.push('# bootloader is the one thing your disk cannot protect you from.');
            L.push('sudo ' + E.update);
            L.push('```');
            L.push('');
            if (E.verifiedBoot) {
                L.push('### Verified boot');
                L.push('');
                L.push('Pi 4 and Pi 5 firmware can be told to check a signature on the boot');
                L.push('image before running it, and to refuse anything that does not match.');
                L.push('');
                L.push('```bash');
                L.push('sudo ' + E.config + ' --edit     # SIGNED_BOOT=1, and a public key');
                L.push('```');
                L.push('');
                L.push('> [!CAUTION]');
                L.push('> Locking the EEPROM and burning the OTP bits that enforce it is');
                L.push('> **irreversible**. Get it wrong and the board will not boot anything');
                L.push('> again, including a rescue image. `pi-boot-guard` deliberately');
                L.push('> refuses to fuse OTP for you and prints the steps instead, so the');
                L.push('> decision stays yours and stays deliberate.');
                L.push('');
                /* The distinction the plan insists on, at the point where a
                   reader is most likely to assume otherwise. Someone arriving
                   from the anti-evil-maid pages has just read about boot
                   measurement, and this is the paragraph that stops them
                   carrying that expectation onto hardware that cannot meet it. */
                L.push('> **This is verified boot, not measured boot, and the difference');
                L.push('> matters here.** Verified means the firmware checks a signature and');
                L.push('> refuses to run what does not match. Measured means each stage is');
                L.push('> hashed into a TPM so a key can be sealed to the result and a remote');
                L.push('> party can be shown it. **The board has no TPM**, so nothing is');
                L.push('> measured, nothing can be sealed, and no attestation is possible.');
                L.push('> Anything on this site that seals to boot state is describing');
                L.push('> different hardware.');
                L.push('');
            }
            L.push('```bash');
            L.push('# Both files, before you change either.');
            E.bootFiles.forEach(function (file) {
                L.push('cp ' + M.espMount + '/' + file + ' ' + M.espMount + '/' + file + '.bak');
            });
            L.push('```');
            L.push('');
            L.push('> Keep the backups on the FAT partition itself. It is the one filesystem');
            L.push('> you can still read from any other machine when the board will not');
            L.push('> start, which is exactly when you will want them.');
            L.push('');
        } else if (f.dual && f.dualOwner === 'existing') {
            L.push('You chose to let **' + esc(s.dualboot) + '\'s** bootloader keep the menu,');
            L.push('so none is installed here. This system supplies a kernel and an');
            L.push('initramfs; the other one finds them.');
            L.push('');
            L.push('Finish this part from the **other** system, after this install:');
            L.push('');
            L.push('```bash');
            L.push('# In the existing system, as root:');
            L.push('echo GRUB_DISABLE_OS_PROBER=false >> /etc/default/grub');
            L.push('grub-mkconfig -o /boot/grub/grub.cfg     # or: update-grub');
            L.push('grep -c menuentry /boot/grub/grub.cfg    # expect more than one');
            L.push('```');
            L.push('');
            L.push('> os-prober has been disabled by default since GRUB 2.06, so without');
            L.push('> that first line the other system builds a menu that looks correct and');
            L.push('> contains one entry.');
            L.push('');
            if (!f.espShared) {
                L.push('> This system has its **own** EFI partition, so the other bootloader');
                L.push('> will not find it by scanning its own. Mount this one where that');
                L.push('> system can read it before running `grub-mkconfig`, or add the entry');
                L.push('> by hand with `efibootmgr`.');
                L.push('');
            }
            if (f.enc) {
                L.push('> Your root volume is encrypted, and `os-prober` does not look inside');
                L.push('> a locked volume. Expect to write the entry by hand. The value it');
                L.push('> needs:');
                L.push('');
                L.push('```bash');
                L.push(uuidCmd);
                L.push('echo "cryptdevice=UUID=$UUID:cryptroot root=/dev/mapper/cryptroot"');
                L.push('```');
                L.push('');
            }
        } else if (f.arm) {
            if (s.arm_boot === 'rpi-firmware') {
                L.push('The Raspberry Pi EEPROM bootloader reads `config.txt` and');
                L.push('`cmdline.txt` from the FAT partition. There is no EFI stub involved.');
                L.push('');
                L.push('```bash');
                L.push('cat /boot/cmdline.txt        # single line, kernel command line');
                L.push('cat /boot/config.txt         # firmware settings');
                L.push('```');
                L.push('');
                L.push('> **Update and then lock the EEPROM.** It runs before anything you');
                L.push('> control, and an attacker with brief physical access can reflash an');
                L.push('> unprotected one — after which none of the disk encryption above');
                L.push('> helps you.');
                L.push('>');
                L.push('> ```bash');
                L.push('> rpi-eeprom-update -a');
                L.push('> vcgencmd bootloader_version');
                L.push('> ```');
            } else if (s.arm_boot === 'extlinux') {
                L.push('```bash');
                L.push('mkdir -p /boot/extlinux');
                L.push(uuidCmd);
                L.push("cat > /boot/extlinux/extlinux.conf <<EOF");
                L.push('LABEL Arch Linux ARM');
                L.push('    KERNEL /Image');
                L.push('    FDT /dtbs/your-board.dtb');
                L.push('    APPEND ' + rootOpts);
                L.push('EOF');
                L.push('```');
                L.push('');
                L.push('> Replace `your-board.dtb` with the device tree for your board — the');
                L.push('> kernel cannot enumerate ARM hardware without it, and the wrong one');
                L.push('> gives you a board that powers on and does nothing.');
            } else {
                L.push('```bash');
                L.push('bootctl install');
                L.push(uuidCmd);
                L.push("cat > /boot/loader/entries/arch.conf <<EOF");
                L.push('title   Arch Linux ARM');
                L.push('linux   /Image');
                L.push('initrd  /initramfs-linux.img');
                L.push('options ' + rootOpts);
                L.push('EOF');
                L.push('```');
            }
        } else if (s.bootloader === 'uki') {
            L.push('```bash');
            L.push(uuidCmd);
            L.push('echo "' + rootOpts + '" > /etc/kernel/cmdline');
            L.push('');
            if (M && M.family === 'gentoo') {
                /* Gentoo builds unified images through dracut rather than a
                   mkinitcpio preset. `--uefi` is what makes it one bundled
                   executable instead of a separate kernel and initramfs. */
                L.push('# Unified kernel image, built by dracut');
                L.push('echo \'uefi="yes"\' >> /etc/dracut.conf.d/uki.conf');
                L.push('echo \'kernel_cmdline="' + rootOpts + '"\' >> /etc/dracut.conf.d/uki.conf');
                L.push('emerge --config sys-kernel/gentoo-kernel-bin   # rebuilds the image');
            } else {
                L.push('# Turn on the unified image preset');
                L.push('sed -i "s|^#\\?ALL_config|ALL_config|" /etc/mkinitcpio.d/linux.preset');
                L.push('mkinitcpio -P');
            }
            L.push('```');
            L.push('');
            if (s.secureboot === 'own-keys') {
                L.push('### Your own Secure Boot keys');
                L.push('');
                L.push('```bash');
                L.push('sbctl status                 # firmware must be in Setup Mode');
                L.push('sbctl create-keys');
                L.push('sbctl enroll-keys -m         # -m keeps the Microsoft OEM certificates');
                L.push('sbctl sign -s /boot/EFI/Linux/arch-linux.efi');
                L.push('sbctl verify');
                L.push('```');
                L.push('');
                L.push('> `-m` keeps Microsoft\'s certificates enrolled. On many machines');
                L.push('> the firmware itself is signed by them, and removing them can leave');
                L.push('> you with hardware that will not initialise. Back up the existing');
                L.push('> keys first, and know where "restore factory keys" is in your');
                L.push('> firmware setup before you start.');
            }
        } else if (s.bootloader === 'systemd-boot') {
            L.push('```bash');
            L.push('bootctl install');
            L.push('');
            L.push("cat > /boot/loader/loader.conf <<'EOF'");
            L.push('default arch.conf');
            L.push('timeout 3');
            L.push('console-mode max');
            L.push('editor no');
            L.push('EOF');
            L.push('');
            L.push(uuidCmd);
            L.push("cat > /boot/loader/entries/arch.conf <<EOF");
            L.push('title   Arch Linux');
            L.push('linux   /vmlinuz-' + ((s.kernels && s.kernels[0]) || 'linux'));
            if (s.microcode && s.microcode !== 'none' && !f.libre) L.push('initrd  /' + s.microcode + '.img');
            L.push('initrd  /initramfs-' + ((s.kernels && s.kernels[0]) || 'linux') + '.img');
            L.push('options ' + rootOpts);
            L.push('EOF');
            L.push('```');
            L.push('');
            L.push('> `editor no` matters. Without it anyone standing at the boot menu can');
            L.push('> append `init=/bin/bash` and walk straight past your login — on an');
            L.push('> unencrypted system that is a full compromise in one keystroke.');
        } else {
            L.push('```bash');
            /* Per-system: the package manager, the package name, the EFI mount
               point and the loader id all differ. Gentoo additionally needs
               GRUB_PLATFORMS set in make.conf *before* GRUB is emerged, or it
               builds for the wrong platform and grub-install says so. */
            const grubEfiDir = (M && M.espMount) || '/boot';
            const grubId = (os.short || os.label).replace(/\s+/g, '');
            if (M && M.family === 'gentoo') {
                L.push('# GRUB_PLATFORMS must be set before GRUB is built, not after.');
                L.push('echo \'GRUB_PLATFORMS="efi-64"\' >> /etc/portage/make.conf');
                L.push(M.install(['sys-boot/grub']));
                if (f.dual) L.push(M.install(['sys-boot/os-prober']));
                L.push('grub-install --efi-directory=' + grubEfiDir);
            } else {
                if (f.dual) L.push('pacman -S os-prober');
                L.push('grub-install --target=x86_64-efi --efi-directory=' + grubEfiDir +
                       ' --bootloader-id=' + grubId);
            }
            if (f.enc) {
                L.push('');
                L.push('# GRUB needs to be told to unlock the root device');
                L.push(uuidCmd);
                L.push('sed -i "s|^GRUB_CMDLINE_LINUX=.*|GRUB_CMDLINE_LINUX=\\"' + rootOpts + '\\"|" /etc/default/grub');
                L.push('echo GRUB_ENABLE_CRYPTODISK=y >> /etc/default/grub');
            }
            if (f.dual) {
                L.push('');
                L.push('echo GRUB_DISABLE_OS_PROBER=false >> /etc/default/grub');
                L.push('# os-prober is disabled by default since GRUB 2.06; without this');
                L.push('# line the other operating system never appears in the menu.');
                if (f.dualDefault === 'other') {
                    /* A menu index moves the next time a kernel is added.
                       `saved` follows the entry instead of its position. */
                    L.push('echo GRUB_DEFAULT=saved >> /etc/default/grub');
                    L.push('echo GRUB_SAVEDEFAULT=true >> /etc/default/grub');
                    L.push('# Boots whatever was chosen last, so picking the other system once');
                    L.push('# makes it the default. A fixed index would move on the next kernel.');
                }
            }
            L.push('');
            L.push('grub-mkconfig -o /boot/grub/grub.cfg');
            if (f.dual) {
                L.push('grep -c menuentry /boot/grub/grub.cfg   # expect more than one');
            }
            L.push('```');
            if (f.dual) {
                L.push('');
                L.push('> If that count is 1, `os-prober` did not find the other system. The');
                L.push('> usual causes are a hibernated Windows and an encrypted Linux root');
                L.push('> that was locked while `grub-mkconfig` ran.');
            }
        }
        L.push('');

        /* ── 6. Services ── */
        L.push('## 6. Services');
        L.push('');
        /* Enabling a service is the one command that differs by init rather
           than by system, so it comes from the init table. On Arch this
           resolves to exactly the systemctl lines that were written here
           before. */
        const en = I ? (u => I.enable(u)) : (u => 'systemctl enable ' + u);
        L.push('```bash');
        if (s.network === 'networkmanager') L.push(en('NetworkManager'));
        if (s.network === 'systemd-networkd') L.push(en('systemd-networkd systemd-resolved iwd'));
        if (s.network === 'iwd') L.push(en('iwd'));
        if (s.desktop === 'gnome') L.push(en('gdm'));
        if (s.desktop === 'kde') L.push(en('sddm'));
        if (s.swap === 'zram' && I && I.label === 'OpenRC') {
            /* zram-generator is a systemd unit generator and has no OpenRC
               equivalent, so pointing an OpenRC reader at it would be a command
               that cannot work. Named rather than silently skipped. */
            L.push('');
            L.push('# zram under OpenRC is configured through /etc/conf.d/zram-init,');
            L.push('# not systemd\'s zram-generator. See the Gentoo wiki page on zram.');
        } else if (s.swap === 'zram') {
            L.push('');
            L.push("cat > /etc/systemd/zram-generator.conf <<'EOF'");
            L.push('[zram0]');
            L.push('zram-size = min(ram / 2, 8192)');
            L.push('compression-algorithm = zstd');
            L.push('EOF');
        }
        L.push('```');
        L.push('');
        if (s.swap === 'zram') {
            L.push('> zram compresses swap in RAM. Nothing from your memory is written to');
            L.push('> disk, which is one fewer place for a key to end up. It cannot');
            L.push('> hibernate — that needs real disk swap at least the size of RAM.');
            L.push('');
        }

        L.push('## 7. Reboot');
        L.push('');
        L.push('```bash');
        if (M && M.imaged) {
            // Nothing to leave and nothing to unmount: every command so far ran
            // on the booted board.
            L.push('sudo reboot');
        } else {
            L.push('exit');
            L.push('umount -R /mnt');
            if (f.enc) L.push('cryptsetup close cryptroot');
            L.push('reboot');
        }
        L.push('```');
        L.push('');
        if (M && M.imaged) {
            L.push('> If it does not come up, the card is readable in any other machine.');
            L.push('> The FAT partition holds `config.txt` and `cmdline.txt` and the copies');
            L.push('> you took of them, so a bad edit is undone from a laptop rather than');
            L.push('> from a board that will not start.');
        } else {
            L.push('> If it does not come up, boot the installer again, `cryptsetup open`,');
            L.push('> remount, ' + (M && M.family === 'gentoo'
                    ? 'redo the bind mounts and `chroot`'
                    : '`arch-chroot`') + ', and you are exactly where you were. Almost');
            L.push('> nothing at this stage is unrecoverable.');
        }
        L.push('');

        /* ── 8. Post-install ── */
        const dpkgs = desktopPackages(s, f);
        const post = postPackages(s, f);
        if (dpkgs.length || post.apps.length || post.aur.length || post.extra.length) {
            L.push('## 8. After the first boot');
            L.push('');
            L.push('Do this from the installed system, logged in as `' + esc(s.username) + '`.');
            L.push('');
            L.push('```bash');
            const all = dpkgs.concat(post.extra, post.apps);
            /* Every system that is not Arch renames some of these, so the
               translation is keyed on that rather than on one family. An Arch
               package name reaching apt or portage is a command that runs,
               fails on its argument, and reads to the reader as this guide
               being wrong about their system. */
            if (M && M.family !== 'arch') {
                const mapped = (typeof window !== 'undefined' && window.osPkgNames)
                    ? window.osPkgNames(osKey, all) : all;
                L.push('sudo ' + M.install(mapped));
            } else {
                L.push('sudo pacman -S --needed \\');
                L.push('    ' + all.join(' '));
            }
            L.push('```');
            L.push('');

            /* Anything Arch does not carry itself. A separate block and a
               separate command, because it is a separate decision: these are
               built from a script somebody else wrote, running as you. */
            if (post.aur.length) {
                if (M && M.aur) {
                    L.push('These are not in the official repositories. They come from the');
                    L.push('AUR, which means a build script a stranger wrote runs as your');
                    L.push('user before anything is installed.');
                    L.push('');
                    L.push('```bash');
                    L.push('paru -S --needed \\');
                    L.push('    ' + post.aur.join(' '));
                    L.push('```');
                    L.push('');
                } else {
                    /* No AUR here. Say which choices that removes by name
                       rather than dropping them out of the list silently -
                       the reader ticked them and is owed the reason. */
                    const mappedAur = (typeof window !== 'undefined' && window.osPkgNames)
                        ? window.osPkgNames(osKey, post.aur) : [];
                    const goneAur = (typeof window !== 'undefined' && window.osPkgUnavailable)
                        ? window.osPkgUnavailable(osKey, post.aur) : [];
                    if (mappedAur.length) {
                        L.push('These come from the AUR on Arch. ' + os.label + ' has no AUR,');
                        L.push('and carries them in its own repositories instead:');
                        L.push('');
                        L.push('```bash');
                        L.push('sudo ' + M.install(mappedAur));
                        L.push('```');
                        L.push('');
                    }
                    if (goneAur.length) {
                        L.push('> Not available on ' + os.label + ', so they are not installed:');
                        L.push('> `' + goneAur.join('`, `') + '`. They are AUR packages on Arch');
                        L.push('> and this system has no equivalent — the authority for what it');
                        L.push('> does have is ' + os.docsName + ': <' + os.docs + '>.');
                        L.push('');
                    }
                }
            }
            if (M && M.family === 'gentoo') {
                L.push('> Names without a category are Gentoo atoms this guide does not yet');
                L.push('> map. Check each against <https://packages.gentoo.org/> before');
                L.push('> running the line — an unqualified name can match more than one');
                L.push('> package, and portage will tell you so rather than guess.');
                L.push('');
                L.push('> Expect this to compile for a while. If any of these are ones');
                L.push('> nobody sensibly builds from source — a browser, an office suite, a');
                L.push('> toolchain — add `--getbinpkg` and take the binary instead. That is');
                L.push('> a supported Gentoo workflow, not a shortcut.');
                L.push('');
            }
            if (f.libre && (s.apps || []).some(a => LIBRE_BLOCKED.indexOf(a) !== -1)) {
                L.push('> Removed under the libre policy: `' +
                       (s.apps || []).filter(a => LIBRE_BLOCKED.indexOf(a) !== -1).join('`, `') +
                       '`. They ship proprietary components.');
                L.push('');
            }

            /* Packages the user typed in themselves. Checked, never blocked.
               A name can be perfectly valid and still be unknown to this
               browser — the real database is on the machine — so the check runs
               there, at install time, and warns rather than aborting. Refusing
               to continue on a renamed package would strand someone who knows
               exactly what they want better than we do. */
            const typed = String(s.extra_packages || '').trim().split(/\s+/).filter(Boolean);
            if (typed.length) {
                L.push('### Your own packages');
                L.push('');
                L.push('These are the names you entered. They are checked against the real');
                L.push('package databases here, on the machine — a name that has been renamed');
                L.push('or dropped upstream should stop *you*, not the script.');
                L.push('');
                /* The existence check, the install and the search URL all come
                   from the model. Three systems asked the same question three
                   different ways here, and a fourth would have meant a fourth
                   `else if` in a block already hard to read — while the branch
                   that ran by default handed `pacman -Si` to apt. */
                const q = M ? M.queryPkg : null;
                L.push('```bash');
                L.push('for pkg in ' + typed.join(' ') + '; do');
                if (q) {
                    L.push('    if ' + q.exists + ' >/dev/null 2>&1; then');
                    L.push('        sudo ' + M.install(['"$pkg"']));
                    if (M.aur) {
                        L.push('    elif command -v paru >/dev/null 2>&1 && paru -Si "$pkg" >/dev/null 2>&1; then');
                        L.push('        # AUR: a build script a stranger wrote, running as you.');
                        L.push('        paru -S --needed "$pkg"');
                    }
                    L.push('    else');
                    L.push('        echo "WARNING: \'$pkg\' ' + q.absent + '" >&2');
                    q.hints.forEach(function (h) { L.push('        echo "  ' + h + '" >&2'); });
                    L.push('    fi');
                }
                L.push('done');
                L.push('```');
                L.push('');
                L.push('> Those links are the ones that would come back empty if the package');
                L.push('> really is gone — open them rather than taking the warning\'s word.');
                L.push('');
                if (M && M.aur) {
                    L.push('> [!NOTE]');
                    L.push('> AUR packages are not reviewed by anyone. `makepkg` runs a `PKGBUILD`');
                    L.push('> a stranger wrote, as your user, before anything is installed. Read');
                    L.push('> it — `paru -G <pkg>` fetches it without building — or run it past');
                    L.push('> `aur-guard`, which is in the security tools list for this reason.');
                    L.push('');
                } else if (M && M.family === 'gentoo') {
                    L.push('> [!NOTE]');
                    L.push('> Packages in the Gentoo tree are reviewed, unlike the AUR — but an');
                    L.push('> **overlay** is not. If you add one, you are trusting whoever');
                    L.push('> maintains it exactly as much as you would trust a PKGBUILD.');
                    L.push('');
                } else if (M && M.family === 'debian') {
                    L.push('> [!NOTE]');
                    L.push('> Everything in the Debian and Raspberry Pi archives is signed and');
                    L.push('> maintained. A third-party apt repository is not: adding one gives');
                    L.push('> its owner the ability to replace any package on the system at the');
                    L.push('> next upgrade, silently. That is a larger trust than the AUR asks');
                    L.push('> for, not a smaller one.');
                    L.push('');
                }
            }
        }

        /* ── Wallpapers ─────────────────────────────────────────────────────
           dusklinux/images, downloaded selectively.

           It lists the folders through the GitHub API and picks at random rather
           than cloning: the whole collection is ~40 MB and somebody who asked
           for 50 images should get 50 images, not a full clone they then have to
           prune. Sequential filenames looked constructible (0001.jpg …) but the
           collection is not uniform — dark/0131 is .jpeg, and the file counts do
           not line up with the highest number — so building URLs by counting
           would 404 on real files. The listing is authoritative.

           Unauthenticated, this is two API calls against a 60/hour limit, and
           every download failure is skipped rather than aborting the run. */
        if (s.wallpapers && s.wallpapers !== 'none') {
            const AVAIL = { dark: 135, light: 134 };
            const want = s.wallpaper_count === 'all' ? 269 : parseInt(s.wallpaper_count || '50', 10);
            const split = parseInt(s.wallpaper_split || '75', 10);

            // Work out how many come from each folder, capped at what each holds.
            let nDark = 0, nLight = 0;
            if (s.wallpapers === 'all') {
                // Everything in both folders. No count, no split, no rounding.
                nDark = AVAIL.dark;
                nLight = AVAIL.light;
            }
            else if (s.wallpapers === 'dark')  nDark = Math.min(want, AVAIL.dark);
            else if (s.wallpapers === 'light') nLight = Math.min(want, AVAIL.light);
            else {
                nDark  = Math.min(Math.round(want * split / 100), AVAIL.dark);
                nLight = Math.min(want - nDark, AVAIL.light);
            }
            const total = nDark + nLight;

            L.push('### Wallpapers');
            L.push('');
            L.push('`' + total + '` image' + (total === 1 ? '' : 's') +
                   (nDark && nLight ? ' — ' + nDark + ' dark and ' + nLight + ' light'
                                    : nDark ? ' from the dark set' : ' from the light set') +
                   ', chosen at random from ' +
                   '[dusklinux/images](' + DUSKY_IMAGES + '). Roughly ' +
                   Math.max(1, Math.round(total * 0.15)) + ' MB.');
            L.push('');
            L.push('```bash');
            L.push('# Wallpapers by dusklinux: ' + DUSKY_IMAGES);
            L.push('# Picks at random from the folder listing rather than cloning the');
            L.push('# whole ~40 MB collection, so you download only what you asked for.');
            L.push('mkdir -p ~/Pictures/wallpapers');
            L.push('');
            L.push('fetch_wallpapers() {');
            L.push('  local tone="$1" count="$2"');
            L.push('  [ "$count" -gt 0 ] || return 0');
            L.push('  # shuf gives a different set each run; -n caps it at what exists.');
            L.push('  curl -fsSL "https://api.github.com/repos/dusklinux/images/contents/$tone" \\');
            L.push('    | grep -o \'"download_url": *"[^"]*"\' | cut -d\'"\' -f4 \\');
            L.push('    | shuf -n "$count" \\');
            L.push('    | while read -r url; do');
            L.push('        # --fail so a missing file is skipped, not saved as an error page.');
            L.push('        curl -fsSL --retry 2 -o "$HOME/Pictures/wallpapers/${tone}-${url##*/}" "$url" \\');
            L.push('          || echo "skipped $url" >&2');
            L.push('      done');
            L.push('}');
            L.push('');
            if (nDark)  L.push('fetch_wallpapers dark ' + nDark);
            if (nLight) L.push('fetch_wallpapers light ' + nLight);
            L.push('');
            L.push('echo "Downloaded $(ls -1 ~/Pictures/wallpapers | wc -l) wallpapers to ~/Pictures/wallpapers"');
            L.push('```');
            L.push('');
            // Setting one is compositor-specific, so say which command applies
            // rather than emitting one that will not work on their desktop.
            if (s.display_server === 'wayland') {
                L.push('Set one with `hyprpaper` (Hyprland), or your compositor\'s own tool —');
                L.push('`swaybg -i ~/Pictures/wallpapers/<file>` works on any wlroots compositor.');
            } else {
                L.push('Set one with `feh --bg-fill ~/Pictures/wallpapers/<file>`, and add that');
                L.push('line to `~/.xinitrc` to have it applied at login.');
            }
            L.push('');
            L.push('> The images are dusklinux\'s work, published separately from Dusky');
            L.push('> itself. Nothing here modifies them.');
            L.push('');
        }

        /* DNS. Every site you visit starts with a lookup, and by default that
           goes to the ISP in plaintext — visible to them and to anyone on the
           path, whatever the browser does with HTTPS afterwards. */
        const dnsProv = DNS_PROVIDERS[s.dns_provider];
        if (dnsProv) {
            L.push('### DNS — ' + dnsProv.label + ', encrypted');
            L.push('');
            L.push('```bash');
            L.push('sudo mkdir -p /etc/systemd/resolved.conf.d');
            L.push("cat | sudo tee /etc/systemd/resolved.conf.d/dns.conf <<'EOF'");
            /* Built by the shared module, so this side and the generator emit
               byte-identical config. `address#hostname` is what actually pins
               the certificate name — `DNSOverTLS=yes` alone encrypts without
               authenticating, and anyone able to answer on port 853 is then
               accepted, which is most of the threat this removes. */
            var dnsConf = window.DnsProviders.buildResolvedConf(dnsProv, s.dns_ipv4_only === 'yes'
                ? 'ipv4' : 'both');
            dnsConf.forEach(function (line) { L.push(line); });
            L.push('EOF');
            L.push('');
            L.push('sudo systemctl enable --now systemd-resolved');
            L.push('sudo ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf');
            L.push('');
            L.push('# Check it took effect. "DNSOverTLS: yes" and the addresses above.');
            L.push('resolvectl status | head -20');
            L.push('```');
            L.push('');
            if (s.network === 'networkmanager') {
                L.push('```bash');
                L.push('# NetworkManager overwrites resolv.conf with whatever DHCP said');
                L.push('# unless it is told to hand DNS to systemd-resolved instead.');
                L.push("cat | sudo tee /etc/NetworkManager/conf.d/dns.conf <<'EOF'");
                L.push('[main]');
                L.push('dns=systemd-resolved');
                L.push('EOF');
                L.push('sudo systemctl restart NetworkManager');
                L.push('```');
                L.push('');
            }
            L.push('> DNS-over-TLS (port 853) with the certificate hostname pinned to');
            L.push('> `' + dnsProv.tls + '`, so the queries are encrypted *and* you know who');
            L.push('> answered. DNSSEC then checks the answers were not tampered with.');
            L.push('');
            L.push('> **What this does not do.** It moves who sees your lookups from your');
            L.push('> ISP to ' + dnsProv.label + '. Their no-logging policy is a published');
            L.push('> claim you cannot verify from here. It also does nothing about SNI or');
            L.push('> the IP you then connect to, so a network observer can often still');
            L.push('> infer the site. This is a real improvement, not anonymity.');
            L.push('');
        } else if (s.dns_provider === 'isp') {
            L.push('### DNS');
            L.push('');
            L.push('> Using whatever DHCP hands out — usually your ISP or your router.');
            L.push('> Nothing to configure, and the lookups are unencrypted: every domain');
            L.push('> you visit is visible to them and to anyone on the path, regardless');
            L.push('> of HTTPS. Re-run the walkthrough and pick a provider if you would');
            L.push('> rather that were not the case.');
            L.push('');
        }

        if (s.firewall === 'ufw') {
            L.push('### Firewall');
            L.push('');
            L.push('```bash');
            L.push('sudo ufw default deny incoming');
            L.push('sudo ufw default allow outgoing');
            if (has(s.apps, 'openssh')) L.push('sudo ufw limit ssh    # rate-limits repeated connection attempts');
            L.push('sudo ufw enable');
            L.push('sudo systemctl enable ufw');
            L.push('```');
            L.push('');
            L.push('> Default-deny inbound is the highest security-per-keystroke item in');
            L.push('> this whole guide. Everything you did not open is closed.');
            L.push('');
        }

        if (s.snapshots === 'snapper' && f.btrfs) {
            L.push('### Snapshots');
            L.push('');
            L.push('```bash');
            L.push('sudo umount /.snapshots && sudo rm -rf /.snapshots');
            L.push('sudo snapper -c root create-config /');
            L.push('sudo btrfs subvolume delete /.snapshots');
            L.push('sudo mkdir /.snapshots && sudo mount -a');
            L.push('sudo systemctl enable --now snapper-timeline.timer snapper-cleanup.timer');
            L.push('```');
            L.push('');
            if (M && M.family === 'gentoo') {
                L.push('> Gentoo has no `snap-pac`, so nothing hooks snapshots to package');
                L.push('> transactions automatically. The timer above still gives you');
                L.push('> scheduled snapshots; a pre-update one is a `portage` hook you write');
                L.push('> yourself, and worth it before a large `@world` rebuild.');
            } else if (M && M.family === 'debian') {
                L.push('> Debian has no `snap-pac`, so nothing ties a snapshot to a package');
                L.push('> transaction on its own. `snapper` ships an apt hook — enable it and');
                L.push('> a broken upgrade becomes a rollback rather than a reimaged card.');
            } else {
                L.push('> With `snap-pac` installed, a snapshot is taken before and after every');
                L.push('> pacman transaction. A broken update becomes a reboot rather than a');
                L.push('> rescue USB.');
            }
            L.push('');
        }

        /* Per-app configuration — the "auto config setup" step. */
        const cfg = appConfig(s, f);
        if (cfg.length) {
            L.push('### Configure what you installed');
            L.push('');
            L.push('These need a decision from you, so they are asked rather than guessed.');
            L.push('');
            cfg.forEach(c => {
                L.push('#### ' + c.title);
                L.push('');
                L.push(c.why);
                L.push('');
                L.push('```bash');
                c.cmds.forEach(x => L.push(x));
                L.push('```');
                L.push('');
            });
        }

        if ((s.security_tools || []).length) {
            L.push('### Security tools');
            L.push('');
            L.push('```bash');
            L.push('curl -fsSL https://raw.githubusercontent.com/tilas01/Unix-SIT/main/scripts/install-security-suite.sh -o install.sh');
            L.push('less install.sh          # read it before running it as root');
            /* On a source distribution, downloading somebody's prebuilt x86_64
               binary is the one thing the reader did not sign up for. The
               installer already has --from-source; use it, and take the
               toolchain as a dependency rather than a surprise. */
            const fromSource = M && M.kernel && M.kernel.compiled;
            /* Separate binaries or the one that carries them all. The same
               choice the generator has always offered; this side asks it now
               rather than deciding for the reader. */
            const asSuite = s.security_tools_packaging === 'suite';
            L.push('sudo bash install.sh --only ' +
                   (asSuite ? 'unix-security-suite' : (s.security_tools || []).join(',')) +
                   (fromSource ? ' --from-source' : ''));
            L.push('```');
            L.push('');
            if (asSuite) {
                L.push('> One binary, `unix-security-suite`, which dispatches to whichever');
                L.push('> tool you invoke — so there is one hash and one signature to check');
                L.push('> rather than ' + (s.security_tools || []).length + ', and one file to');
                L.push('> keep updated. It carries every tool whether or not you enable them,');
                L.push('> which is the trade: less to verify, more on the disk.');
                L.push('');
                L.push('> Each tool still has to be configured and enabled separately. The');
                L.push('> suite changes how they arrive, not what they do — and nothing here');
                L.push('> is enabled by installing it.');
                L.push('');
            }
            if (fromSource) {
                L.push('> **Built here, from source.** You chose a system that compiles its');
                L.push('> own software, so the installer is told to do the same rather than');
                L.push('> fetching a prebuilt x86_64 binary — which is both the point of');
                L.push('> ' + os.label + ' and the only way these get built for your CPU.');
                L.push('> It needs a Rust toolchain: `emerge dev-lang/rust` if `cargo` is');
                L.push('> not already there. Expect it to take a while.');
                L.push('');
                L.push('> Building from source means the signature check covers the *source*');
                L.push('> you fetched, not a binary somebody else produced. That is a');
                L.push('> stronger position, and it is worth knowing you are in it.');
                L.push('');
            } else {
                L.push('> The installer verifies each binary\'s SHA-512 hash **and** GPG');
                L.push('> signature, pins the signing key fingerprint, and fails closed. It');
                L.push('> installs the daemons but does not enable them — several of these can');
                L.push('> lock you out, which is the point of them.');
                L.push('');
            }
            if (has(s.security_tools, 'anti-ducky')) {
                L.push('> **Anti-Ducky specifically:** its keystroke-timing thresholds have');
                L.push('> never been measured on real hardware, so its false-positive rate is');
                L.push('> unknown — and it guards the keyboard you log in with. Test it while');
                L.push('> you still have SSH or a second keyboard.');
                L.push('');
                L.push('#### Enrol your own input devices first');
                L.push('');
                L.push('Anti-Ducky grants trust by a vote from an already-trusted keyboard.');
                L.push('On a fresh install there is no such keyboard, so the first one you');
                L.push('plug in is the one it sandboxes. Enrol before you enable the daemon.');
                L.push('');
                L.push('```bash');
                L.push('# Plug in every keyboard, mouse and dock you actually use, then:');
                L.push('sudo anti-ducky --enroll   # confirms each device one at a time');
                L.push('');
                L.push('# Check what it now trusts before enabling anything.');
                L.push('sudo anti-ducky --export-whitelist');
                L.push('```');
                L.push('');
                L.push('> It asks about each device separately rather than offering "yes to');
                L.push('> all". A machine that already has something malicious attached');
                L.push('> should not have it blessed by a single keypress.');
                L.push('');
                L.push('#### Hand the allowlist to usbkill');
                L.push('');
                L.push('If you also run [usbkill](https://github.com/hephaest0s/usbkill), give');
                L.push('it the same list. Two tools with two different ideas of what is');
                L.push('trusted is how a machine powers itself off over its owner\'s own');
                L.push('keyboard.');
                L.push('');
                L.push('```bash');
                L.push('sudo install -d -m 0755 /etc/usbkill');
                L.push('');
                L.push('# --export-whitelist exits non-zero on an empty list, and the &&');
                L.push('# keeps that failure from being swallowed — otherwise a bad export');
                L.push('# writes an empty allowlist, and an empty allowlist trusts nothing.');
                L.push('trusted=$(sudo anti-ducky --export-whitelist | paste -sd,) &&');
                L.push('  printf \'[config]\\nwhitelist = %s\\n\' "$trusted" |');
                L.push('  sudo tee /etc/usbkill/usbkill.ini >/dev/null');
                L.push('');
                L.push('cat /etc/usbkill/usbkill.ini   # read it back before arming anything');
                L.push('```');
                L.push('');
                L.push('> [!CAUTION]');
                L.push('> usbkill powers the machine off the moment an unlisted device');
                L.push('> appears — no confirmation, no chance to save. Re-run the export');
                L.push('> after enrolling anything new, or the next dock you plug in ends');
                L.push('> the session.');
                L.push('');

                L.push('#### What happens when it catches something');
                L.push('');
                L.push('The payload is captured to `/var/log/anti-ducky/payload_*.log` with a');
                L.push('SHA-256 for chain of custody, and the device is deauthorized at the');
                L.push('kernel so it cannot deliver another keystroke. That happens whatever');
                L.push('you configure below.');
                L.push('');
                L.push('```bash');
                var resp = s.ducky_response || 'lock';
                if (resp === 'lockdown') {
                    L.push('# Staged lockdown, then power off. Asks you to type ARM.');
                    L.push('# Order matters: sessions locked, kernel lockdown raised, LUKS');
                    L.push('# suspended so the key leaves RAM, and only then is power cut.');
                    L.push('sudo anti-ducky --set-response lockdown');
                } else if (resp === 'poweroff') {
                    L.push('# Hard power-off, so the disk-encryption keys leave RAM before');
                    L.push('# anyone can pull the DIMMs. Asks you to type ARM to confirm.');
                    L.push('sudo anti-ducky --set-response poweroff');
                } else if (resp === 'alert') {
                    L.push('# Alert only. The device is blocked and the payload saved either');
                    L.push('# way; this just declines to do anything further.');
                    L.push('sudo anti-ducky --set-response alert');
                } else {
                    L.push('# Lock every session, so an attacker cannot use the unlocked');
                    L.push('# desktop the injected keystrokes were aimed at.');
                    L.push('sudo anti-ducky --set-response lock');
                }
                L.push('```');
                L.push('');
                if (resp === 'poweroff') {
                    L.push('> [!CAUTION]');
                    L.push('> This loses unsaved work with no confirmation, and a false');
                    L.push('> positive triggers it. Anti-Ducky\'s timing thresholds have');
                    L.push('> never been measured on real hardware, so its false-positive');
                    L.push('> rate is unknown. Test it before relying on it.');
                    L.push('');
                }
                if (resp === 'lock') {
                    L.push('> A lock screen does not protect the LUKS master key — it stays in');
                    L.push('> kernel memory while the volume is open. Pair this with');
                    L.push('> `anti-evil-maid --lock-now` if that is what you need.');
                    L.push('');
                }
                if (resp === 'lockdown') {
                    L.push('> [!CAUTION]');
                    L.push('> This loses unsaved work exactly as a power-off does — the extra');
                    L.push('> steps close attack surface, they do not make it recoverable.');
                    L.push('');
                    L.push('> The LUKS suspend is delegated to `anti-evil-maid --suspend-only`,');
                    L.push('> which stages `cryptsetup` into tmpfs and locks its own pages first');
                    L.push('> — the same handling the auto-lock uses, rather than a second copy');
                    L.push('> of the most deadlock-prone code in the project. If anti-evil-maid');
                    L.push('> is not installed and configured, the lockdown still locks the');
                    L.push('> sessions and still powers off; it just cannot flush the key, and');
                    L.push('> it says so at the time.');
                    L.push('');
                    L.push('> Power is cut with the kernel\'s sysrq trigger, not `poweroff`.');
                    L.push('> After the volume is suspended the root filesystem is frozen, so');
                    L.push('> `/sbin/poweroff` cannot even be *read* — calling it would block');
                    L.push('> forever and leave the machine locked but still running, which is');
                    L.push('> the opposite of the intent. `/proc/sysrq-trigger` is virtual and');
                    L.push('> needs no disk. Check `kernel.sysrq` is not 0 if you rely on this.');
                    L.push('');
                }
                L.push('Show the alert after the next boot. A power-off takes the on-screen');
                L.push('warning with it, so without this the owner finds an unexplained');
                L.push('shutdown, assumes hardware, and plugs the device back in.');
                L.push('');
                L.push('```bash');
                L.push('sudo tee /etc/systemd/system/anti-ducky-boot-alert.service >/dev/null <<\'UNIT\'');
                L.push('[Unit]');
                L.push('Description=Show any BadUSB alert recorded before this boot');
                L.push('After=multi-user.target');
                L.push('');
                L.push('[Service]');
                L.push('Type=oneshot');
                L.push('ExecStart=/usr/bin/anti-ducky --show-boot-alerts');
                L.push('StandardOutput=tty');
                L.push('TTYPath=/dev/tty1');
                L.push('');
                L.push('[Install]');
                L.push('WantedBy=multi-user.target');
                L.push('UNIT');
                L.push('');
                L.push('sudo systemctl enable anti-ducky-boot-alert.service');
                L.push('```');
                L.push('');
            }
        }

        /* LUKS auto-lock. Same encryption guard as the duress section, and for
           the same reason: there is nothing to suspend on an unencrypted
           install, and a hand-edited JSON config reaches this emitter without
           passing the walkthrough's `when`. */
        const autolock = s.luks_autolock;
        if (autolock && autolock !== 'never' && f.enc && f.root) {
            L.push('### Lock the disk, not just the screen');
            L.push('');
            L.push('Locking your session leaves the LUKS master key in kernel memory. A');
            L.push('DMA-capable port, a cold-boot attack on the DIMMs or a kernel bug all');
            L.push('recover it from there. `cryptsetup luksSuspend` flushes the key and');
            L.push('freezes the device until the passphrase is entered again — after that,');
            L.push('the disk is as protected as it is when the machine is off.');
            L.push('');
            L.push('```bash');
            if (autolock === 'on-lock') {
                L.push('# Write the config and the session-lock hook.');
                L.push('sudo anti-evil-maid --configure-autolock --idle never');
                L.push('');
                L.push('# Point your screen locker at the hook, so the key stops being');
                L.push('# resident the moment you lock the session.');
                L.push('#   /usr/local/bin/anti-evil-maid-on-lock');
            } else {
                L.push('sudo anti-evil-maid --configure-autolock --idle ' + autolock);
                L.push('');
                L.push('# Nothing is armed until you enable the timer.');
                L.push('sudo systemctl enable --now anti-evil-maid-autolock.timer');
            }
            L.push('');
            L.push('# Lock on demand at any time:');
            L.push('sudo anti-evil-maid --lock-now');
            L.push('```');
            L.push('');
            if (s.luks_lock_on_screen === 'yes' || autolock === 'on-lock') {
                L.push('#### Make the lock screen an actual barrier');
                L.push('');
                L.push('This installs a watcher for logind\'s session-lock signal, so the');
                L.push('volume is suspended the moment you lock the screen — no timer, no');
                L.push('window. Getting back in then needs the disk passphrase rather than');
                L.push('just your login password, which is the whole difference between a UI');
                L.push('and a boundary.');
                L.push('');
                L.push('```bash');
                L.push('# Needs dbus-monitor, which is in the dbus package.');
                L.push('command -v dbus-monitor || sudo ' +
                       (M ? M.install([(typeof window !== 'undefined' && window.osPkgName)
                                        ? window.osPkgName(modelKey, 'dbus') : 'dbus'])
                          : 'pacman -S --needed dbus'));
                L.push('');
                L.push('sudo anti-evil-maid --install-lock-hook');
                L.push('');
                L.push('# Installed disabled. Enable it once you have tested it.');
                L.push('sudo systemctl enable --now anti-evil-maid-lock-watch.service');
                L.push('```');
                L.push('');
                L.push('> [!CAUTION]');
                L.push('> Test this while you can still reach the machine physically. Once');
                L.push('> enabled, the first time your screensaver fires the disk freezes');
                L.push('> until you type the passphrase — if you cannot, the only way out is');
                L.push('> a power cycle.');
                L.push('');
            }
            L.push('');
            L.push('> [!CAUTION]');
            L.push('> Suspending the volume that backs `/` freezes **every** disk read');
            L.push('> until you type the passphrase. The tool stages `cryptsetup` and its');
            L.push('> libraries into tmpfs and locks its own pages into RAM first, so the');
            L.push('> resume path is never read from the device it just froze — but test');
            L.push('> it once while you can still reach the machine physically.');
            L.push('');
            L.push('> [!NOTE]');
            L.push('> **The unlock delay is not phone-grade brute-force protection.** After');
            L.push('> four wrong attempts the resume prompt imposes a delay that doubles');
            L.push('> from 30 seconds to a ceiling of one hour. That raises the cost of');
            L.push('> someone typing at *this* machine. It is not comparable to a phone:');
            L.push('> GrapheneOS enforces its delays in a secure element, so bypassing the');
            L.push('> OS does not bypass them. A PC has no such component, and an attacker');
            L.push('> who images the disk attacks the header offline where this delay does');
            L.push('> not exist. What defends an imaged header is the Argon2id cost and a');
            L.push('> passphrase strong enough to survive it.');
            L.push('');
        }

        /* Duress PINs. Only reachable when scarecrow is installed and the disk
           is encrypted — a duress PIN erases a LUKS header, and there is none to
           erase otherwise. The device is `f.root`, the partition the guide has
           already told cryptsetup to encrypt, so it is never asked for twice
           and cannot disagree with what was actually created. */
        const pins = s.duress_pins || [];
        // `f.enc`, not just `f.root` — root is always set, so checking it alone
        // emitted the whole section for an unencrypted install, telling the
        // reader to erase a LUKS header that does not exist. The walkthrough's
        // `when` already prevents choosing that combination, but a hand-edited
        // JSON config reaches the emitter directly and must not produce
        // commands that cannot work.
        if (pins.length && f.enc && f.root) {
            L.push('### Duress PINs');
            L.push('');
            L.push('> **Take a LUKS header backup before you set any of these.** A duress');
            L.push('> PIN erases the header, and without a backup that is unrecoverable —');
            L.push('> which is the intent, but it also means a mistake is final. Keep the');
            L.push('> backup somewhere the person you are hiding from cannot reach; on the');
            L.push('> same machine it defeats the whole mechanism.');
            L.push('');
            L.push('```bash');
            L.push('# Back up the header first. Store this off the machine.');
            L.push('sudo cryptsetup luksHeaderBackup ' + f.root +
                   ' --header-backup-file ~/luks-header-backup.img');
            L.push('');
            L.push('# Name the device a duress PIN erases. Nothing is erased until this');
            L.push('# is set: scarecrow will not guess which disk to destroy.');
            L.push('sudo scarecrow --set-duress-device ' + f.root);
            L.push('');
            if (has(pins, 'duress')) {
                L.push('# Duress: erases the header, then behaves like a wrong password.');
                L.push('sudo scarecrow --set-duress-pin');
            }
            if (has(pins, 'decoy')) {
                L.push('# Decoy: a working session in a decoy home. Erases nothing.');
                L.push('sudo scarecrow --set-decoy-pin');
            }
            if (has(pins, 'both')) {
                L.push('# Both: erases the header AND opens the decoy session.');
                L.push('sudo scarecrow --set-duress-decoy-pin');
            }
            L.push('```');
            L.push('');
            if (has(pins, 'decoy') || has(pins, 'both')) {
                L.push('> **Populate the decoy home.** It lives at');
                L.push('> `/etc/arch-security/scarecrow/decoy-home`. An account with nothing');
                L.push('> in it is not a believable account — put real, dull files there:');
                L.push('> some documents, a browser profile, a shell history.');
                L.push('');
            }
            L.push('> Each PIN must be different from your real passphrase, and memorable');
            L.push('> under pressure — you will only ever reach for one in the worst');
            L.push('> moment. Nothing on screen distinguishes any of them from an ordinary');
            L.push('> login, which is the entire point.');
            L.push('');

            /* Setting a PIN configures nothing on its own — something has to
               check it. Without this block the PINs were enrolled and then
               never reached, which is the worst possible state: you believe you
               have a duress PIN and you do not. */
            L.push('#### Wire the PINs into the login');
            L.push('');
            L.push('These are checked at the **login** prompt, not the boot passphrase');
            L.push('prompt. Setting a PIN does not connect it to anything; this is what');
            L.push('makes it fire. Stock `pam_exec` — no custom PAM module — so it works');
            L.push('anywhere PAM does: `login`, greetd, sddm, gdm, `su`.');
            L.push('');
            L.push('```bash');
            L.push('# Insert ABOVE the first pam_unix auth line.');
            L.push('sudo sed -i \'0,/^auth.*pam_unix\\.so/s##'
                   + 'auth [success=done default=ignore] pam_exec.so expose_authtok quiet '
                   + '/usr/bin/scarecrow --pam-gate\\n&#\' /etc/pam.d/system-auth');
            L.push('');
            L.push('# Read it back. Do not skip this.');
            L.push('grep -n -A1 scarecrow /etc/pam.d/system-auth');
            L.push('```');
            L.push('');
            L.push('> [!CAUTION]');
            L.push('> **Keep a root shell open on another TTY while you do this.** A mistake');
            L.push('> in `/etc/pam.d/system-auth` locks every account out of the machine,');
            L.push('> including root, and recovery means booting the install medium. Test');
            L.push('> logging in from a third TTY before you close either of the others.');
            L.push('');
            L.push('`expose_authtok` passes the entered password to scarecrow on stdin, so');
            L.push('you type it once and nothing on screen differs from an ordinary login.');
            L.push('Your real password still goes to `pam_unix` exactly as before, because');
            L.push('a non-matching PIN exits non-zero and `default=ignore` hands the');
            L.push('decision straight back.');
            L.push('');
            if (has(pins, 'decoy') || has(pins, 'both')) {
                L.push('The decoy session is flagged in `/run`, so a shell profile can send');
                L.push('it to the decoy home:');
                L.push('');
                L.push('```bash');
                L.push('sudo tee /etc/profile.d/scarecrow-decoy.sh >/dev/null <<\'DECOY\'');
                L.push('# Set by scarecrow when a decoy PIN was used. In /run, so it is tmpfs');
                L.push('# and cannot survive a reboot — a stale marker would drop you into the');
                L.push('# decoy home on an ordinary login, which looks like losing your data.');
                L.push('if [ -f /run/scarecrow/decoy-session ]; then');
                L.push('    export HOME=/etc/arch-security/scarecrow/decoy-home');
                L.push('    cd "$HOME" || true');
                L.push('fi');
                L.push('DECOY');
                L.push('sudo chmod 0644 /etc/profile.d/scarecrow-decoy.sh');
                L.push('```');
                L.push('');
            }
        }

        if (s.buskill && s.buskill !== 'none') {
            L.push('### BusKill');
            L.push('');
            L.push('```bash');
            L.push("cat | sudo tee /etc/udev/rules.d/99-buskill.rules <<'EOF'");
            L.push('SUBSYSTEM=="usb", ACTION=="remove", ENV{ID_MODEL}=="BusKill*", RUN+="' +
                   (s.buskill === 'shutdown' ? '/usr/bin/systemctl poweroff' : '/usr/bin/loginctl lock-sessions') + '"');
            L.push('EOF');
            L.push('sudo udevadm control --reload-rules');
            L.push('```');
            L.push('');
            if (s.buskill === 'shutdown') {
                L.push('> **This cuts power on every disconnect, accidental or not.** Unsaved');
                L.push('> work is gone. Rehearse it in a virtual machine before you trust it');
                L.push('> on a machine you use.');
            } else {
                L.push('> Locking is the non-destructive option: pull the cable and the');
                L.push('> session locks. You can always get back in.');
            }
            L.push('');
        }

        L.push('---');
        L.push('');
        L.push('## Where to go from here');
        L.push('');
        L.push('- [The wiki](https://tilas01.github.io/Unix-SIT/wiki.html) — every option above, explained in full');
        L.push('- [Firmware lockdown](https://tilas01.github.io/Unix-SIT/wiki.html#bios-lockdown) — do this if you have not');
        L.push('- [AUR safety](https://tilas01.github.io/Unix-SIT/wiki.html#aur-safety) — before you install your first AUR package');
        L.push('- [Arch Wiki](https://wiki.archlinux.org/) — the authority for all of it');
        L.push('');
        L.push('_Set up a backup. Snapshots live on the disk that fails._');

        return L.join('\n');
    }

    /* Per-application configuration that genuinely needs an answer. */
    function appConfig(s, f) {
        const out = [];
        const apps = s.apps || [];
        if (has(apps, 'git')) {
            out.push({
                title: 'git',
                why: 'git refuses to commit without an identity, and it goes into every ' +
                     'commit you ever make — including public ones.',
                cmds: ['git config --global user.name "Your Name"',
                       'git config --global user.email "you@example.com"',
                       'git config --global init.defaultBranch main']
            });
        }
        if (has(apps, 'openssh')) {
            out.push({
                title: 'openssh',
                why: 'The defaults permit password authentication. Keys only, and no ' +
                     'root login, closes the two things automated scanners try first. ' +
                     'Copy your key across *before* you disable passwords, or you will ' +
                     'lock yourself out.',
                cmds: ['ssh-keygen -t ed25519 -a 100',
                       '# copy the public key to the server first, then:',
                       "sudo sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config",
                       "sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config",
                       'sudo systemctl enable --now sshd']
            });
            /* A second factor for SSH, only when libre-otp is actually being
               installed. Offering it otherwise would emit a ForceCommand
               pointing at a binary that is not on the machine — which locks the
               user out of their own server on the next connection. */
            if (has(s.security_tools, 'libre-otp')) {
                out.push({
                    title: 'openssh + libre-otp (second factor)',
                    why: 'A TOTP code on top of the key. There is no PAM module — this ' +
                         'crate builds a binary, not a cdylib — so the gate runs as ' +
                         'the sshd ForceCommand instead. The check happens after key ' +
                         'authentication, so a wrong code costs an attacker a valid ' +
                         'private key first. Keep a second session open while you test ' +
                         'this: a mistake here locks you out of a remote machine, and ' +
                         'reloading sshd does not drop connections that are already up.',
                    cmds: ['sudo libre-otp --setup --hash=SHA256',
                           '# Scan the QR with a 2FA app that is open source and offline —',
                           '# Aegis or FreeOTP. A proprietary cloud authenticator syncs the',
                           '# seed onto a server you do not control, which is the thing this avoids.',
                           '',
                           "printf '%s\n' 'Match User " + esc(s.username) + "' \\",
                           "    '    ForceCommand /usr/local/bin/libre-otp --gate' \\",
                           "    '    AllowTcpForwarding no' \\",
                           "    '    PermitTunnel no' | sudo tee -a /etc/ssh/sshd_config",
                           '',
                           '# Validate BEFORE reloading. This is the step that stops a typo',
                           '# from becoming a lockout.',
                           'sudo sshd -t && sudo systemctl reload sshd',
                           '',
                           '# From a SECOND terminal, confirm you can still log in.']
                });
            }
        }
        if (has(apps, 'docker')) {
            out.push({
                title: 'docker',
                why: 'Adding yourself to the docker group is equivalent to giving ' +
                     'yourself passwordless root: the daemon runs as root and will ' +
                     'mount any path you ask it to. Use rootless docker instead unless ' +
                     'you need the daemon.',
                cmds: ['sudo systemctl enable --now docker',
                       '# Root-equivalent. Prefer rootless if you can:',
                       'dockerd-rootless-setuptool.sh install',
                       '# Only if you accept the above:',
                       '# sudo usermod -aG docker ' + esc(s.username)]
            });
        }
        if (s.palette && PALETTE_INFO[s.palette] && f.gui) {
            const p = PALETTE_INFO[s.palette];
            const themed = [];
            if (has(apps, 'kitty')) themed.push('kitty');
            if (has(apps, 'alacritty')) themed.push('alacritty');
            if (has(apps, 'neovim')) themed.push('neovim');
            if (themed.length) {
                out.push({
                    title: p.label + ' theme for ' + themed.join(', '),
                    why: 'One palette across the terminal, the editor and the prompt, so ' +
                         'they agree with each other. Themes are per-application config ' +
                         'files, not a system setting — this fetches them from upstream: ' +
                         p.repo,
                    cmds: ['mkdir -p ~/.config']
                        .concat(has(apps, 'kitty') ? ['# kitty: add "include ' + s.palette + '.conf" to ~/.config/kitty/kitty.conf'] : [])
                        .concat(has(apps, 'alacritty') ? ['# alacritty: import the ' + p.label + ' toml into ~/.config/alacritty/alacritty.toml'] : [])
                        .concat(has(apps, 'neovim') ? ['# neovim: install the ' + p.label + ' colourscheme plugin, then `colorscheme`'] : [])
                });
            }
        }
        return out;
    }

    /* ── Shell script ───────────────────────────────────────────────────── */

    function buildManualScript(s) {
        const f = facts(s);
        const md = buildManualGuide(s);
        const L = [];

        L.push('#!/usr/bin/env bash');
        L.push('#');
        L.push('# Arch Linux install — generated by the *nix Install Guides manual walkthrough.');
        L.push('#');
        L.push('# READ THIS BEFORE RUNNING IT. It repartitions ' + f.disk + ' and does not');
        L.push('# ask twice. Nothing on that disk survives.');
        L.push('#');
        L.push('# The markdown guide explains why each command is here. This is the same');
        L.push('# sequence with the prose stripped out.');
        L.push('');
        L.push('set -Eeuo pipefail');
        if (s.verbosity === 'debug') {
            L.push('set -x        # debug verbosity: echo every command before running it');
        }
        if (s.verbosity === 'quiet') {
            L.push('exec 1>/dev/null   # quiet: suppress stdout, errors still reach stderr');
        }
        L.push('');
        L.push('trap \'echo "FAILED at line $LINENO. The disk may be half-configured." >&2\' ERR');
        L.push('');
        L.push('# A generated script that runs without you having read it is exactly the');
        L.push('# failure mode this project exists to avoid.');
        L.push('read -rp "Have you read this script in full? Type YES to continue: " ok');
        L.push('[[ "$ok" == "YES" ]] || { echo "Stopping."; exit 1; }');
        L.push('');
        L.push('lsblk');
        L.push('read -rp "Destroy everything on ' + f.disk + '? Type the disk path to confirm: " confirm');
        L.push('[[ "$confirm" == "' + f.disk + '" ]] || { echo "Mismatch. Stopping."; exit 1; }');
        L.push('');

        /* Pull every fenced bash block out of the markdown, in order. Building
           the script from the guide is what guarantees they cannot diverge. */
        const blocks = [];
        const lines = md.split('\n');
        let inBlock = false, buf = [];
        for (const line of lines) {
            if (line.trim() === '```bash') { inBlock = true; buf = []; continue; }
            if (inBlock && line.trim() === '```') { inBlock = false; blocks.push(buf.join('\n')); continue; }
            if (inBlock) buf.push(line);
        }
        blocks.forEach((b, i) => {
            L.push('# ── block ' + (i + 1) + ' ' + '─'.repeat(Math.max(0, 60 - String(i + 1).length)));
            L.push(b);
            L.push('');
        });

        L.push('echo "Done. Read the markdown guide for what to do after the first boot."');
        return L.join('\n');
    }

    /* ── Command-by-command mode ────────────────────────────────────────────
       Splits the finished guide into one step per command block, so the
       walkthrough can hand them over one at a time instead of as a wall of
       markdown.

       It parses the guide rather than emitting a second time. That is the whole
       point: a separate command emitter would be a second source of truth, and
       the two would drift the first time anyone edited one of them. Parsing
       means command mode is, by construction, exactly the guide.

       Each step carries the nearest heading, the prose immediately above the
       block (the reason the command exists), the commands themselves, and
       whether running it destroys data. */

    /* Commands that destroy the disk you are installing to. Matched on the
       command text, not the prose, so a step that merely *mentions* mkfs is not
       flagged.

       Calibrated deliberately narrow. The typed confirmation exists for one
       thing: "this erases the device you named". Firing it on routine plumbing
       teaches people to type past it, and then it is not there when it matters.
       `rm -rf /.snapshots` — snapper's standard setup, replacing an empty mount
       point on a fresh install — used to trip the old `rm -rf /` pattern, which
       is why that one now requires a bare root. */
    var DESTRUCTIVE = [
        /\bsgdisk\b/, /\bwipefs\b/, /\bmkfs\./, /\bmkswap\b/,
        /cryptsetup\s+(?:luksFormat|erase|luksErase)/,
        /\bparted\b[^\n]*\bmklabel\b/, /\bdd\s+if=/, /\bshred\b/,
        /\bblkdiscard\b/,
        /\brm\s+-[a-z]*r[a-z]*f?\s+\/\s*(?:$|[;&|])/m   // bare root, not /some/path
    ];

    function isDestructive(cmd) {
        return DESTRUCTIVE.some(function (rx) { return rx.test(cmd); });
    }

    /* Expected output for the commands where "did that work?" is a real
       question and the answer is not obvious. Deliberately partial — inventing
       an expected output for every command would produce confident-looking
       fiction, and a wrong expectation is worse than none. Keyed by a pattern
       matched against the command text. */
    var EXPECTED = [
        [/^\s*ping\b/m,            'Replies with times. If it hangs, there is no network yet.'],
        [/\blsblk\b/,              'A tree of your disks and partitions. Identify the target by size and model.'],
        [/\btimedatectl\b/,        'No output on success. "System clock synchronized: yes" if you query it.'],
        [/cryptsetup\s+luksFormat/, 'Asks for YES in capitals, then the passphrase twice. Nothing else is printed.'],
        [/cryptsetup\s+open\b/,    'Asks for the passphrase. Silence means it unlocked.'],
        [/\bmkfs\.fat\b/,          'A line naming the device and the FAT type.'],
        [/\bmkfs\.(?:ext4|xfs)\b/, 'Several lines of geometry, ending without an error.'],
        [/\bmkfs\.btrfs\b/,        'A summary block: label, UUID, node size, and the device list.'],
        [/\bpacstrap\b/,           'A long download and install. It ends with the package count, no errors.'],
        [/\bgenfstab\b/,           'Writes /etc/fstab. Print it afterwards and check every line has a real UUID.'],
        [/\bmkinitcpio\b/,         'Builds each preset. Warnings about missing firmware are normal; errors are not.'],
        [/\bbootctl\s+install/,    '"Created ..." lines for the EFI files it copied.'],
        [/grub-install/,           '"Installation finished. No error reported."'],
        [/grub-mkconfig/,          'Finds your kernels, then "done".'],
        [/\bpasswd\b/,             'Asks twice. Nothing is echoed as you type.'],
        [/systemctl\s+enable/,     'A symlink line per unit. No output means it was already enabled.'],
        [/\breflector\b/,          'Takes a minute — it downloads from each mirror to rank them by real speed.'],
        [/\barch-chroot\b/,        'Your prompt changes. You are now inside the new system.']
    ];

    function expectedFor(cmd) {
        for (var i = 0; i < EXPECTED.length; i++) {
            if (EXPECTED[i][0].test(cmd)) return EXPECTED[i][1];
        }
        return null;
    }

    /**
     * Parse a generated guide into ordered command steps.
     * @param {string} md output of buildManualGuide()
     * @returns {Array<{n:number,title:string,why:string,commands:string,
     *                  destructive:boolean,expected:string|null}>}
     */
    function buildCommandSteps(md) {
        var lines = String(md).split('\n');
        var steps = [];
        var heading = 'Before you start';
        var prose = [];
        var inBlock = false, buf = [];

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            if (/^\s*```bash\s*$/.test(line)) { inBlock = true; buf = []; continue; }
            if (inBlock && /^\s*```\s*$/.test(line)) {
                inBlock = false;
                var cmd = buf.join('\n').replace(/\s+$/, '');
                if (cmd) {
                    // Where the reason lives depends on the section. Most of the
                    // guide explains itself in `#` comments inside the block —
                    // that is deliberate, so the reasoning survives being pasted
                    // into a terminal — while some sections put a sentence above
                    // it. Prefer the prose, fall back to the comments, so a step
                    // is never shown with no explanation at all.
                    var why = prose.slice(-4).join(' ').replace(/\s+/g, ' ').trim();
                    if (!why) {
                        why = cmd.split('\n')
                            .filter(function (l) { return /^\s*#/.test(l); })
                            .map(function (l) { return l.replace(/^\s*#\s?/, ''); })
                            .join(' ').replace(/\s+/g, ' ').trim();
                    }
                    // Displayed as plain text, so the markdown markers have to
                    // go — otherwise the reason reads "**Lock the firmware
                    // down.** Update it..." with the asterisks showing.
                    why = why
                        .replace(/`([^`]+)`/g, '$1')
                        .replace(/\*\*([^*]+)\*\*/g, '$1')
                        .replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
                        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
                        .replace(/<([^>]+)>/g, '$1')
                        .trim();
                    steps.push({
                        n: steps.length + 1,
                        title: heading,
                        why: why,
                        commands: cmd,
                        destructive: isDestructive(cmd),
                        expected: expectedFor(cmd)
                    });
                }
                prose = [];
                continue;
            }
            if (inBlock) { buf.push(line); continue; }

            var h = /^#{2,4}\s+(.*)$/.exec(line);
            if (h) {
                heading = h[1].replace(/^\d+\.\s*/, '').trim();
                // Cleared on every heading, deliberately. Letting prose carry
                // across sections raised coverage from 5 steps to 10 but
                // attached the wrong reason to some of them — the first step's
                // command is `loadkeys` and it was explained as firmware
                // lockdown, because that was the last paragraph before it. A
                // confidently wrong explanation on a page about partitioning
                // disks is worse than no explanation, and `expected` still
                // covers most steps either way.
                prose = [];
                continue;
            }
            if (!line.trim()) continue;
            // Table rows are data, not prose. Blockquotes are where this guide
            // puts its warnings, so they count — with the marker stripped.
            if (/^\s*\|/.test(line)) continue;
            if (/^\s*>/.test(line)) { prose.push(line.replace(/^\s*>\s?/, '').trim()); continue; }
            // A numbered or bulleted instruction is a reason; the marker is not.
            prose.push(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim());
        }
        return steps;
    }

    window.buildManualGuide = buildManualGuide;
    window.buildManualScript = buildManualScript;
    window.buildCommandSteps = buildCommandSteps;
    // Exported so the tests check the same predicate the UI gates on. Keeping a
    // second copy of the pattern list in the test is how the two drifted: the
    // test disagreed with the implementation about `rm -rf /.snapshots`.
    window.isDestructiveCommand = isDestructive;
})();
