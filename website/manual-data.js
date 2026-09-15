/* ============================================================================
   manual-data.js — the question set behind the manual walkthrough.
   ----------------------------------------------------------------------------
   Declarative on purpose. Every question is data: what it asks, when it applies,
   what each answer means, which wiki section explains it, and what it
   contributes to the generated guide. The renderer in manual.js knows nothing
   about Arch; it only knows how to draw a question and collect an answer.

   That split is what keeps this at parity with the dynamic generator. Adding an
   option means adding it here once, and it appears in the walkthrough, in the
   markdown guide, in the shell script and in the exported JSON together —
   rather than in three places that drift.

   Field reference
     id        state key
     title     the question
     help      tooltip body; every question has one
     wiki      anchor in wiki.html, reached by right-click as well
     type      'choice' | 'multi' | 'text' | 'bool'
     when      (s) => boolean; omit for "always"
     options   [{ value, label, desc, note?, recommended?, danger?, locks? }]
     validate  (value, s) => null | 'message'
     section   heading the emitted guide steps are filed under
   ========================================================================= */

'use strict';

/* Values Dusky fixes for you. Selecting it locks these rather than silently
   overriding them, so you can see what the choice costs before you make it.
   Every key here must be the id of a real step and every value must be one of
   that step's option values — a key that matches nothing locks nothing, and a
   value that matches no option leaves the question with no answer to carry
   forward. `tests/dusky-locks.mjs` fails the build if either stops holding. */
/* What choosing Dusky genuinely settles for you.

   Each of these is a thing Dusky's own install scripts require: Hyprland is a
   Wayland compositor, the dotfiles are written for zsh, and the status bar and
   menus are laid out around a Nerd Font's glyph widths. Pick something else and
   Dusky does not merely look different, it does not work.

   `palette` is deliberately NOT here. Tokyo Night is what this *site* uses, and
   forcing it onto somebody's installed desktop confused a house style with a
   requirement — Dusky themes itself and does not care which scheme you pick.
   The question stays free, and the recommended badge is enough of a nudge. */
const DUSKY_LOCKS = {
    display_server: 'wayland',
    shell: 'zsh',
    font: 'jetbrains-mono-nerd'
};

/* Dusky, by dusklinux. Worth being precise about what it is: a dotfiles and
   install-script project for Hyprland on Wayland, not a separate operating
   system and nothing to do with dwm. It ships Waybar, Rofi, Swaync, Wlogout and
   SDDM. Links kept together so the credit stays correct everywhere it appears. */
const DUSKY_REPO = 'https://github.com/dusklinux/dusky';
/* The wallpapers are a separate repository from Dusky itself, which is why they
   are offered to anyone with a desktop rather than only to Dusky users. Two
   folders: dark/ 135 files, light/ 134 — 269 in total, ~40 MB. */
const DUSKY_IMAGES = 'https://github.com/dusklinux/images';
const DUSKY_VIDEO = 'https://www.youtube.com/watch?v=JmgvSdEIK8c';

/* Where Dusky's automated setup can actually run, and why not, where it cannot.
   Dusky is Hyprland — a wlroots compositor on Wayland — installed by scripts
   that assume pacman and the AUR. That combination is what decides this, and
   the reasons differ enough per system to be worth stating rather than
   collapsing into "unsupported":

     Arch     its native target.
     Gentoo   Linux, so DRM/KMS, libinput and elogind are all present, and
              gui-wm/hyprland is packaged. The install steps need translating
              from pacman to emerge, which is work, not an obstacle.
     FreeBSD  Wayland and Hyprland both exist in ports, but nobody has verified
              Dusky's own scripts there. Offered untested would be worse than
              not offered — this project has removed that exact class of claim
              several times.
     OpenBSD  X11 and Xenocara. wlroots support is not there and Hyprland is not
              packaged, so this is not a gap that closes with effort.
     Pi OS    ships and expects its own desktop, and the Pi's graphics stack is
              not what Dusky's scripts assume. */
const DUSKY_SUPPORT = {
    arch:    { ok: true },
    gentoo:  { ok: true },
    freebsd: { ok: false, why: 'Hyprland runs on FreeBSD, but Dusky\'s own install ' +
                               'scripts assume pacman and the AUR and nobody has ' +
                               'verified them here. It is hidden rather than offered ' +
                               'untested.' },
    openbsd: { ok: false, why: 'OpenBSD uses X11 through Xenocara. Hyprland needs ' +
                               'wlroots on Wayland, which OpenBSD does not have and ' +
                               'does not package, so Dusky cannot run here at all. ' +
                               'Pick cwm, fvwm or i3 instead.' },
    raspios: { ok: false, why: 'Raspberry Pi OS ships its own desktop and its graphics ' +
                               'stack is not the one Dusky\'s scripts expect.' }
};
const DUSKY_CHANNEL = 'https://www.youtube.com/@dusk_everyday';

/* ── Target operating system ─────────────────────────────────────────────────
   The variable every OS-specific string reads from. Nothing downstream may
   hard-code "Arch" any more — see `osName()` below.

   The table itself lives in os-meta.js, which every page loads before this
   file, because the header switcher needs it on pages the walkthrough is not
   on. Read rather than copied: two tables would let the dropdown and the
   question below disagree about which system the reader is installing, and the
   answer decides which commands get printed. */
const OS_META = (typeof window !== 'undefined' && window.OS_META) || null;

/* Loud rather than quiet. Without the table every `when:` on this page silently
   resolves to Arch, so a Gentoo walkthrough would render as an Arch one and
   look entirely normal — the failure this project keeps finding. */
if (!OS_META || !OS_META.arch) {
    throw new Error('manual-data.js: os-meta.js must load first. It holds the ' +
                    'only definition of the target systems and is not duplicated here.');
}

/* Arch is the default when no OS has been chosen.

   Every downstream `when:` and every emitter must resolve the target through
   these helpers rather than reading `s.os` directly. That keeps the fallback in
   one place, so an unanswered or unrecognised selection behaves exactly as the
   site did before the selector existed — which is what allows the existing
   permutation coverage to stay valid. */
function osId(s) { return window.osIdOf(s && s.os); }
function osMeta(s) { return OS_META[osId(s)]; }
function osName(s) { return osMeta(s).label; }
/** True for Linux targets — Arch and Gentoo share primitives the BSDs do not. */
function isLinux(s) { return osId(s) === 'arch' || osId(s) === 'gentoo'; }

/* Answers a system fixes for you, the same shape as DUSKY_LOCKS above and
   enforced by the same code path, so they render identically: the question is
   still shown, the fixed answer is still visible, and it says what fixed it.

   Not the same thing as a hidden question. A hidden question is one that does
   not apply; a locked one applies and has only one possible answer. Raspberry
   Pi OS runs on Pi hardware, so offering x86_64 beside it would be offering a
   combination that cannot exist — but the reader should see that rather than
   find the architecture question mysteriously absent.

   Read from OS_META so the constraint lives beside the system it belongs to.
   `tests/dusky-locks.mjs` checks these against the real step ids and option
   values, exactly as it does Dusky's. */
const OS_LOCKS = {};
Object.keys(OS_META).forEach(id => {
    if (OS_META[id].locks) OS_LOCKS[id] = OS_META[id].locks;
});

const STEPS = [

/* ── Target OS ─────────────────────────────────────────────────────────── */
{
    id: 'os',
    section: 'Before you start',
    title: 'Which operating system are you installing?',
    help: 'This changes everything downstream — the installer, the package ' +
          'manager, the encryption tooling, the init system and which ' +
          'documentation is authoritative. Only Arch is finished; the others ' +
          'are visible so you can read them, and are marked accordingly.',
    wiki: 'architecture',
    type: 'choice',
    optional: true,
    /* Built from the table rather than written out again. The header switcher
       offers the same four with the same warnings, and a card here that said
       something different from the card there would be a question and a control
       disagreeing about the same choice. */
    options: Object.keys(OS_META).map(id => {
        const m = OS_META[id];
        const opt = {
            value: id,
            label: m.label + (m.complete ? '' : ' — 🚧 Work in progress'),
            desc: m.desc
        };
        if (id === window.OS_DEFAULT) opt.recommended = true;
        if (m.danger) opt.danger = m.danger;
        return opt;
    }),
    note: 'Skipping this selects Arch, which is the only complete guide.'
},

/* ── Architecture ──────────────────────────────────────────────────────── */
{
    id: 'arch',
    section: 'Before you start',
    title: 'Which CPU architecture are you installing on?',
    help: 'Everything downstream depends on this. x86_64 is any Intel or AMD ' +
          'desktop or laptop. aarch64 is 64-bit ARM: Raspberry Pi, Pine64, ' +
          'most ARM servers. Run "uname -m" on the machine if you are unsure. ' +
          'Getting this wrong does not produce a slightly worse install, it ' +
          'produces a script that cannot work.',
    wiki: 'architecture',
    type: 'choice',
    options: [
        { value: 'x86_64', label: 'x86_64 (Intel / AMD)', recommended: true,
          desc: 'Standard PC. UEFI firmware, an EFI system partition, CPU ' +
                'microcode, and Secure Boot available.' },
        { value: 'aarch64', label: 'aarch64 (64-bit ARM)',
          desc: 'Raspberry Pi, Pine64, ARM servers. Uses Arch Linux ARM — a ' +
                'different project with different mirrors and signing keys — ' +
                'and boots via a device tree rather than an EFI executable.' }
    ]
},
{
    id: 'board',
    section: 'Before you start',
    title: 'Which ARM board?',
    help: 'ARM boards do not share a boot path the way PCs do. The board ' +
          'decides whether you get UEFI, U-Boot, or vendor firmware in an ' +
          'EEPROM, and which device tree the kernel needs.',
    wiki: 'arch-arm',
    when: s => s.arch === 'aarch64',
    type: 'choice',
    options: [
        { value: 'rpi', label: 'Raspberry Pi 4 / 5',
          desc: 'Bootloader lives in an on-board EEPROM that runs before ' +
                'anything you control. No UEFI Secure Boot.' },
        { value: 'uefi-arm', label: 'ARM board with UEFI (EDK2)', recommended: true,
          desc: 'Ampere, some Rockchip boards, ARM VMs. Closest to the x86 ' +
                'path: an ESP and an EFI bootloader.' },
        { value: 'uboot', label: 'Generic U-Boot SBC',
          desc: 'Pine64, Odroid, most SBCs. Boots via extlinux.conf or ' +
                'boot.scr plus a device tree.' }
    ]
},

{
    id: 'libre',
    section: 'Before you start',
    title: 'Enforce a strictly libre software policy?',
    help: 'On, the guide refuses anything with proprietary or closed-source ' +
          'components: no microcode, no proprietary graphics drivers, no ' +
          'Discord, no Steam. Off, you get microcode and the drivers your ' +
          'hardware actually needs.',
    wiki: 'libre-policy',
    type: 'bool',
    options: [
        { value: 'yes', label: 'Yes, libre only',
          desc: 'Anything with a proprietary component is excluded and the ' +
                'guide says what you are giving up.' },
        { value: 'no', label: 'No', recommended: true,
          desc: 'Microcode and proprietary drivers permitted.' }
    ]
},

/* ── Dual boot ─────────────────────────────────────────────────────────── */
{
    id: 'dualboot',
    section: 'Before you start',
    title: 'Is anything else staying on this machine?',
    help: 'Dual booting is the most common way people lose data during an ' +
          'Arch install. What you pick here changes the partitioning, whether ' +
          'the EFI system partition is created or reused, and which warnings ' +
          'the guide gives you.',
    wiki: 'dual-boot',
    type: 'choice',
    options: [
        { value: 'none', label: 'No — this disk is only for Arch', recommended: true,
          desc: 'The whole disk gets repartitioned. Simplest, and nothing ' +
                'else can be broken by it.',
          danger: 'Everything currently on the target disk is destroyed.' },
        { value: 'windows', label: 'Windows 10 or 11',
          desc: 'Shares the existing EFI system partition. Adds the Fast ' +
                'Startup, BitLocker and RTC steps, and the guide will refuse ' +
                'to format the ESP.' },
        { value: 'linux', label: 'Another Linux distribution',
          desc: 'Shares the ESP and, usually, the bootloader. Adds os-prober ' +
                'or a manual loader entry.' },
        { value: 'arch', label: 'An existing Arch install',
          desc: 'Reuses the ESP; you choose whether to share /home.' }
    ]
},
/* ── Dual boot: order, ownership, default ───────────────────────────────────
   Three decisions that are easy to run together and are not the same. Which
   install happens first decides whether space has to be left now; which
   bootloader draws the menu decides whether this guide installs one at all;
   and which entry is selected on a timeout decides what a machine does when
   nobody is at the keyboard. Getting the middle one wrong is how a working
   dual boot ends up booting straight into one system. */
{
    id: 'dualboot_order',
    section: 'Before you start',
    title: 'Is this the first install on this disk, or the second?',
    help: 'Installing first means leaving unpartitioned space for the other ' +
          'system now. Installing second means the other one is already there ' +
          'and you shrink it to make room. First is the easier order when both ' +
          'systems are yours, because the second installer finds free space ' +
          'instead of you shrinking a filesystem that already holds your data.',
    wiki: 'dual-boot',
    when: s => s.dualboot && s.dualboot !== 'none',
    type: 'choice',
    options: [
        { value: 'second', label: 'Second — the other system is already installed',
          recommended: true,
          desc: 'The usual case. Shrink the other system from its own tools ' +
                'first, then this guide fills the free space.' },
        { value: 'first', label: 'First — leave room for the other system',
          desc: 'This system takes a fixed size and the rest of the disk is ' +
                'left unpartitioned for the other installer to claim.' }
    ],
    note: s => s.dualboot_order === 'first'
        ? 'Going first means there is no existing EFI partition to share and no ' +
          'existing bootloader to hand the menu to, so those two questions ' +
          'answer themselves: your own ESP, and your own bootloader.'
        : ''
},
{
    id: 'dualboot_owner',
    section: 'Before you start',
    title: 'Which bootloader shows the boot menu?',
    help: 'One bootloader owns the menu the firmware lands on. Installing a ' +
          'second one that does not know about the first is the usual way the ' +
          'other operating system vanishes from the menu — the machine still ' +
          'boots, just always into the same system.',
    wiki: 'dual-boot',
    when: s => s.dualboot && s.dualboot !== 'none' && s.dualboot_order !== 'first',
    type: 'choice',
    options: [
        { value: 'this', label: 'This system\'s — it detects the other', recommended: true,
          desc: 'GRUB with os-prober finds the other system and adds it. The ' +
                'usual answer, and the only one that works when the other ' +
                'system is Windows.' },
        { value: 'existing', label: 'The existing system\'s — add an entry there',
          desc: 'This guide installs no bootloader. You finish by booting the ' +
                'other system and running its own grub-mkconfig so it picks ' +
                'this one up.' }
    ],
    note: s => s.dualboot_owner === 'existing' && s.encryption && s.encryption !== 'none'
        ? 'Your root volume is encrypted and os-prober does not look inside a ' +
          'locked volume, so expect to write that menu entry by hand. The guide ' +
          'prints the UUID you will need.'
        : ''
},
{
    id: 'dualboot_default',
    section: 'Before you start',
    title: 'Which system boots when nobody presses anything?',
    help: 'The entry the menu falls back to when the timeout runs out. Worth ' +
          'setting deliberately on a machine that reboots unattended.',
    wiki: 'dual-boot',
    when: s => s.dualboot && s.dualboot !== 'none',
    type: 'choice',
    options: [
        { value: 'this', label: 'This system', recommended: true,
          desc: 'The one you are installing now.' },
        { value: 'other', label: 'The other system',
          desc: 'Set through GRUB_DEFAULT=saved, which follows the entry ' +
                'rather than its position in the menu.' }
    ]
},
{
    id: 'dualboot_esp_mode',
    section: 'Before you start',
    title: 'Share the other system\'s EFI partition, or make your own?',
    help: 'The EFI system partition is the small FAT32 partition the firmware ' +
          'boots from. Sharing the existing one is the usual advice and it ' +
          'works. Making a second one costs 512 MiB and keeps the two systems ' +
          'off each other\'s boot ground — which is what boot-integrity ' +
          'checking needs in order to mean anything.',
    wiki: 'dual-boot-separate-boot',
    when: s => s.dualboot && s.dualboot !== 'none',
    type: 'choice',
    options: [
        { value: 'separate', label: 'Give this system its own EFI partition', recommended: true,
          desc: 'A second ESP, 512 MiB, on the same disk. The other system\'s ' +
                'is never touched. You pick between them in the firmware boot menu.' },
        { value: 'share', label: 'Share the existing EFI partition',
          desc: 'What most guides tell you to do. One partition, both ' +
                'bootloaders. Simpler, and the other system\'s updates write ' +
                'to the same place yours does.' }
    ],
    /* Said here rather than only in the wiki, because the consequence lands on
       a tool the reader may have already chosen and would otherwise find
       mysteriously noisy months later. */
    /* Plain indexOf rather than a helper. `has()` lives inside manual-guide.js's
       IIFE and is not global — the test harnesses concatenate both files into
       one scope, so borrowing it would pass every gate and throw in a browser,
       which is the failure mode this project keeps finding. */
    note: s => (s.security_tools || []).indexOf('anti-evil-maid') !== -1
        ? 'You selected anti-evil-maid. It hashes the boot partition and tells ' +
          'you when it changes — and Windows Update rewrites its loader on the ' +
          'ESP whenever it likes. Share the partition and every Windows update ' +
          'reports as tampering, until you stop believing the alerts. A ' +
          'separate ESP is what makes that alarm worth listening to.'
        : 'If you later add anti-evil-maid or any boot-integrity checking, a ' +
          'shared ESP will report the other system\'s updates as tampering.'
},
{
    id: 'dualboot_esp',
    section: 'Before you start',
    title: 'Which partition is the EFI system partition?',
    help: s => s.dualboot_esp_mode === 'separate'
        ? 'The one you are about to create, not the existing one. Run ' +
          '"lsblk -f" to see what is already there, and give the next free ' +
          'number on the same disk — if the last partition is p3, this will ' +
          'be p4. The guide creates and formats it for you.'
        : 'Run "lsblk -f" on the running system. The ESP is the small FAT32 ' +
          'partition, usually 100-500 MiB, with partition type EF00. This ' +
          'partition is mounted, never formatted — formatting it deletes the ' +
          'other operating system\'s bootloader.',
    /* Static, not a function of the answers. `help` and `note` may be
       functions; `wiki` may not — it is concatenated straight into
       `wiki.html#…`, and `tests/wiki-targets.mjs` only matches the quoted
       form, so a function here would render a broken link *and* be skipped by
       the gate meant to catch broken links. */
    wiki: 'dual-boot-esp',
    when: s => s.dualboot && s.dualboot !== 'none',
    type: 'text',
    placeholder: '/dev/nvme0n1p1',
    validate: v => /^\/dev\/[a-z0-9]+p?\d+$/.test(v.trim())
        ? null
        : 'Needs a partition path such as /dev/nvme0n1p1 or /dev/sda1.'
},

/* ── Disk ──────────────────────────────────────────────────────────────── */
{
    id: 'disk',
    section: 'Disk',
    title: 'Which disk are you installing to?',
    help: 'This is the single most destructive value in the whole guide — every ' +
          'partitioning command is aimed at it, and they do not ask twice. ' +
          'Identify the disk by its size and model, never by the name you ' +
          'expect: device names are assigned in the order the kernel finds ' +
          'them, so the disk that was /dev/sda last week can be /dev/sdb today.',
    /* How to actually find it. The old help text said "run lsblk" and left it
       there, which is not much use if you have never read lsblk output or do not
       know why the name has a `p` in it on one machine and not on another. */
    howto: {
        intro: 'In the live environment, list what is attached:',
        command: 'lsblk -o NAME,SIZE,MODEL,TRAN,MOUNTPOINTS',
        reading: 'Look for the row with no parent indentation and the size you ' +
                 'expect. Its children are existing partitions — if it has ' +
                 'some, there is data on this disk. Cross-check the MODEL ' +
                 'column against the drive you mean to erase.',
        naming: [
            ['/dev/nvme0n1', 'An NVMe SSD. "n1" is the first namespace on controller 0. ' +
                             'Partitions get a p: /dev/nvme0n1p1.'],
            ['/dev/sda',     'SATA or USB — an SSD, a hard disk, or the stick you booted from. ' +
                             'Partitions have no p: /dev/sda1.'],
            ['/dev/mmcblk0', 'An SD card or eMMC, common on ARM boards. ' +
                             'Partitions get a p: /dev/mmcblk0p1.'],
            ['/dev/vda',     'A virtio disk — you are in a virtual machine.']
        ],
        warn: 'Enter the whole disk, not a partition: /dev/nvme0n1, not ' +
              '/dev/nvme0n1p2. And make sure it is not the USB stick you are ' +
              'running from — check TRAN for "usb".'
    },
    wiki: 'target-disk',
    type: 'text',
    placeholder: '/dev/nvme0n1',
    validate: v => {
        v = v.trim();
        // Named partitions are the mistake people actually make, so say which
        // one they typed rather than restating the rule.
        var part = /^\/dev\/(nvme\d+n\d+p|mmcblk\d+p|loop\d+p)(\d+)$/.exec(v)
                || /^\/dev\/([a-z]+d[a-z])(\d+)$/.exec(v);
        if (part) {
            return 'That is partition ' + part[2] + ' of a disk, not the disk. Drop the ' +
                   'trailing ' + (/p\d+$/.test(v) ? '"p' + part[2] + '"' : '"' + part[2] + '"') + '.';
        }
        return /^\/dev\/[a-z0-9]+$/.test(v)
            ? null
            : 'Needs a whole-disk path such as /dev/nvme0n1, /dev/sda or /dev/mmcblk0.';
    }
},
{
    id: 'encryption',
    section: 'Disk',
    title: 'Encrypt the disk?',
    help: 'Full-disk encryption is what makes a stolen laptop a stolen laptop ' +
          'rather than a data breach. It costs you a passphrase at every boot ' +
          'and nothing else. LUKS2 with Argon2id is the current default and ' +
          'resists GPU brute-forcing far better than LUKS1.',
    wiki: 'partitioning',
    type: 'choice',
    options: [
        { value: 'luks2', label: 'LUKS2 with Argon2id', recommended: true,
          desc: 'Modern defaults, memory-hard key derivation. Requires a ' +
                'bootloader that can read a LUKS2 header, so not Legacy BIOS ' +
                'GRUB.' },
        { value: 'luks1', label: 'LUKS1',
          desc: 'Only if you are constrained to Legacy BIOS with GRUB. PBKDF2 ' +
                'rather than Argon2id, so a weak passphrase falls much faster.' },
        { value: 'none', label: 'No encryption',
          desc: 'Reasonable for a desktop that never leaves a room you ' +
                'control. Anyone who picks the machine up reads everything.',
          danger: 'Anyone with physical access reads every file, including ' +
                  'your saved passwords and SSH keys.' }
    ]
},
{
    id: 'filesystem',
    section: 'Disk',
    title: 'Which filesystem?',
    help: 'Btrfs gives you snapshots, so a bad update is one rollback away, ' +
          'at the cost of subvolumes to lay out and its own tooling. ext4 is ' +
          'the fewest moving parts and is extremely well understood.',
    wiki: 'filesystem',
    type: 'choice',
    options: [
        { value: 'btrfs', label: 'Btrfs with subvolumes', recommended: true,
          desc: 'Snapshots, compression, and rollback. The guide lays out ' +
                '@, @home, @log, @pkg and @snapshots so a rollback does not ' +
                'also roll back your logs or re-download the package cache.' },
        { value: 'ext4', label: 'ext4',
          desc: 'Format and forget. No snapshots.' },
        { value: 'xfs', label: 'XFS',
          desc: 'Good with large files. No snapshots; cannot be shrunk.' }
    ]
},
{
    id: 'swap',
    section: 'Disk',
    title: 'Swap?',
    help: 'zram compresses swap in RAM and is the sensible default on almost ' +
          'any modern machine. A swap file or partition is only needed if you ' +
          'want hibernation, which needs swap at least as large as RAM.',
    wiki: 'swap_size',
    type: 'choice',
    options: [
        { value: 'zram', label: 'zram (compressed, in RAM)', recommended: true,
          desc: 'No disk space used, no plaintext of your memory written to ' +
                'disk. Cannot hibernate.' },
        { value: 'swapfile', label: 'Swap file on disk',
          desc: 'Resizable later. Inside the encrypted volume, so hibernation ' +
                'images stay encrypted.' },
        { value: 'partition', label: 'Dedicated swap partition',
          desc: 'Traditional. Fixed size.' },
        { value: 'none', label: 'None',
          desc: 'Fine with plenty of RAM. The OOM killer becomes your memory ' +
                'management strategy.' }
    ]
},

/* ── Boot ──────────────────────────────────────────────────────────────── */
{
    id: 'firmware',
    section: 'Boot',
    title: 'Firmware mode',
    help: 'Check with "ls /sys/firmware/efi" from the live environment — if ' +
          'that directory exists you booted UEFI. Legacy BIOS restricts you ' +
          'to GRUB and LUKS1 and rules out Secure Boot entirely.',
    wiki: 'firmware',
    when: s => s.arch === 'x86_64',
    type: 'choice',
    options: [
        { value: 'uefi', label: 'UEFI', recommended: true,
          desc: 'Required for unified kernel images, systemd-boot and Secure ' +
                'Boot.' },
        { value: 'bios', label: 'Legacy BIOS / CSM',
          desc: 'GRUB only, LUKS1 only, no Secure Boot.',
          note: 'Selecting this restricts encryption to LUKS1 and the ' +
                'bootloader to GRUB.' }
    ]
},
{
    id: 'bootloader',
    section: 'Boot',
    title: 'Which bootloader?',
    help: 'A unified kernel image bundles kernel, initramfs and command line ' +
          'into one signed EFI file, which is what makes Secure Boot with ' +
          'your own keys meaningful. systemd-boot is the simplest thing that ' +
          'works on UEFI. GRUB is the only option on Legacy BIOS.',
    wiki: 'bootloader',
    when: s => s.arch === 'x86_64',
    type: 'choice',
    options: [
        { value: 'uki', label: 'Unified Kernel Image + your own Secure Boot keys',
          recommended: true,
          desc: 'Strongest boot chain. Kernel, initramfs and cmdline in one ' +
                'signed file, so the command line cannot be edited at the ' +
                'boot menu.',
          note: 'Needs a 1 GiB ESP — two UKIs plus a fallback do not fit in 512 MiB.' },
        { value: 'systemd-boot', label: 'systemd-boot',
          desc: 'Small, no configuration language, reads loader entries from ' +
                'the ESP.' },
        { value: 'grub', label: 'GRUB',
          desc: 'Most features, most configuration, works on BIOS and with ' +
                'many operating systems side by side.' }
    ]
},
{
    id: 'arm_boot',
    section: 'Boot',
    title: 'How does this board boot?',
    help: 'ARM boards do not agree on a boot mechanism. This decides whether ' +
          'the guide writes an EFI loader entry, an extlinux.conf, or the ' +
          'Raspberry Pi config.txt and cmdline.txt.',
    wiki: 'arch-arm',
    when: s => s.arch === 'aarch64',
    type: 'choice',
    options: [
        { value: 'rpi-firmware', label: 'Raspberry Pi firmware (config.txt)',
          when: s => s.board === 'rpi',
          desc: 'The EEPROM bootloader loads start.elf, which loads the ' +
                'kernel and device tree from a FAT partition.' },
        { value: 'extlinux', label: 'U-Boot / extlinux.conf', recommended: true,
          desc: 'The common SBC path. A text file listing kernel, initramfs ' +
                'and device tree.' },
        { value: 'efi-arm', label: 'UEFI bootloader (systemd-boot or GRUB)',
          desc: 'For boards whose firmware implements UEFI.' }
    ]
},
{
    id: 'secureboot',
    section: 'Boot',
    title: 'Secure Boot',
    help: 'Secure Boot stops the firmware executing an unsigned bootloader. ' +
          'Enrolling your own keys means you decide what may boot, rather ' +
          'than a third-party certificate authority. Turning it off for Arch ' +
          'also lowers the bar for any other operating system on the machine.',
    wiki: 'bootloader',
    when: s => s.arch === 'x86_64' && s.firmware === 'uefi',
    type: 'choice',
    options: [
        { value: 'own-keys', label: 'Enrol my own keys', recommended: true,
          desc: 'Generate PK, KEK and db, sign the bootloader and the UKI, ' +
                'enrol them in firmware setup mode.',
          note: 'Back up the existing keys first, and know how to clear them ' +
                'from firmware setup before you start.' },
        { value: 'shim', label: 'shim with the Microsoft-signed chain',
          desc: 'Works without touching firmware keys. You are trusting ' +
                'Microsoft\'s CA.' },
        { value: 'off', label: 'Leave Secure Boot off',
          desc: 'Simplest. Anything that can write to the ESP can replace ' +
                'your bootloader.' }
    ]
},

/* ── Gentoo ─────────────────────────────────────────────────────────────────
   The questions that make Gentoo Gentoo rather than Arch with a different
   package manager. Every one is gated on the system, so an Arch reader never
   sees them and the Arch permutation count is unaffected.

   The Gentoo Handbook is the authority for all of it:
   https://wiki.gentoo.org/wiki/Handbook:AMD64 */
{
    id: 'gentoo_stage3',
    section: 'Before you start',
    title: 'Which stage3 tarball?',
    help: 'The base system comes as a signed tarball rather than a package ' +
          'transaction. Which one you take decides the init system and the ' +
          'toolchain, and it has to agree with the profile you select next — ' +
          'an openrc stage3 under a systemd profile is the most common way a ' +
          'first Gentoo install goes wrong.',
    wiki: 'gentoo-install',
    when: s => osId(s) === 'gentoo',
    type: 'choice',
    options: [
        { value: 'openrc', label: 'openrc', recommended: true,
          desc: 'Gentoo\'s own init. The common choice, and what the Handbook ' +
                'assumes unless you tell it otherwise.' },
        { value: 'systemd', label: 'systemd',
          desc: 'Closest to the Arch experience. Pick this if you already know ' +
                'systemd and would rather not learn OpenRC at the same time as ' +
                'Gentoo.' },
        { value: 'hardened-openrc', label: 'hardened (OpenRC)',
          desc: 'The hardened toolchain and profile. More defence, more ' +
                'friction: some packages need work, and you will meet it.' },
        { value: 'musl', label: 'musl',
          desc: 'A smaller libc with a smaller ecosystem. Choose it only if ' +
                'you already know why you want it — expect to solve problems ' +
                'nobody has written up.' }
    ]
},
{
    id: 'gentoo_kernel',
    section: 'System',
    title: 'How should the kernel be built?',
    help: 'Gentoo does not ship you a kernel by default. These are genuinely ' +
          'different amounts of work, and only the first is a sensible first ' +
          'install.',
    wiki: 'gentoo-kernel',
    when: s => osId(s) === 'gentoo',
    type: 'choice',
    options: [
        { value: 'bin', label: 'gentoo-kernel-bin — prebuilt', recommended: true,
          desc: 'Gentoo\'s configuration, already compiled. Minutes rather ' +
                'than hours, and it boots. Start here and come back to ' +
                'menuconfig once the machine is up.' },
        { value: 'dist', label: 'gentoo-kernel — Gentoo config, compiled here',
          desc: 'The same configuration built locally, so it matches your ' +
                'CFLAGS. Long build, no configuration decisions to get wrong.' },
        { value: 'manual', label: 'gentoo-sources — you run menuconfig',
          desc: 'Full control and full responsibility.',
          danger: 'A config missing your disk controller, your filesystem or ' +
                  'dm-crypt will not boot and will not tell you which one is ' +
                  'absent. Do not make this your first Gentoo kernel.' }
    ]
},
{
    id: 'gentoo_binpkgs',
    section: 'System',
    title: 'Use binary packages where they exist?',
    help: 'Compiling everything is the reason to run Gentoo, and compiling a ' +
          'browser is the reason people stop. --getbinpkg takes a prebuilt ' +
          'package when one is published and builds the rest from source, ' +
          'which is a supported Gentoo workflow rather than a shortcut.',
    wiki: 'gentoo-install',
    when: s => osId(s) === 'gentoo',
    type: 'choice',
    options: [
        { value: 'big', label: 'Only for the big ones', recommended: true,
          desc: 'Source by default, binaries for Firefox, LibreOffice, ' +
                'Chromium, Rust and LLVM. Those five are most of the wait: ' +
                'Chromium alone can be the better part of a day on a laptop.' },
        { value: 'none', label: 'Never — build everything',
          desc: 'Every package compiled for this machine. Honest about the ' +
                'cost: plan the first install as an overnight job.' },
        { value: 'all', label: 'Prefer binaries wherever published',
          desc: 'Fastest to a working desktop. You give up most of the ' +
                'per-machine optimisation that made you choose Gentoo.' }
    ]
},
{
    id: 'gentoo_makeopts',
    section: 'System',
    title: 'How many parallel build jobs?',
    help: 'MAKEOPTS="-jN". More jobs finish sooner until memory runs out — ' +
          'each one can want around 2 GB when linking, so a machine with many ' +
          'cores and little RAM meets the OOM killer partway through a long ' +
          'build. The usual rule is the lower of your core count and half your ' +
          'RAM in GB.',
    wiki: 'gentoo-install',
    when: s => osId(s) === 'gentoo',
    type: 'choice',
    options: [
        { value: 'nproc', label: 'One per core — $(nproc)', recommended: true,
          desc: 'The default advice. Right on any machine with roughly 2 GB of ' +
                'RAM per core.' },
        { value: 'half', label: 'Half the cores',
          desc: 'Safer on a laptop with 8 GB or less, and leaves the machine ' +
                'usable while it builds.' },
        { value: '1', label: 'One job — no parallelism',
          desc: 'Slowest, and the one that always finishes. Useful when a ' +
                'build has already failed on memory once.' }
    ]
},
{
    id: 'gentoo_use',
    section: 'System',
    title: 'USE flags',
    help: 'USE decides which optional features are compiled in at all — not ' +
          'merely which are enabled. A package built without pulseaudio ' +
          'support does not contain it. This is the other reason to run ' +
          'Gentoo, and the one that takes the longest to learn.',
    wiki: 'gentoo-use-flags',
    when: s => osId(s) === 'gentoo',
    type: 'choice',
    options: [
        { value: 'profile', label: 'Whatever the profile sets', recommended: true,
          desc: 'Change nothing to begin with. The profile\'s defaults are ' +
                'sensible and you can add flags once you know what you are ' +
                'missing.' },
        { value: 'desktop', label: 'Profile plus a desktop set',
          desc: 'Adds elogind, dbus, policykit and the usual desktop wants, ' +
                'and turns off systemd where the profile is OpenRC.' },
        { value: 'minimal', label: 'Deliberately minimal',
          desc: 'Strips X, Wayland, bluetooth and multimedia. For a server. ' +
                'Adding one back later means rebuilding what depends on it.' }
    ]
},
{
    id: 'kernels',
    section: 'Boot',
    title: 'Which kernels? (pick at least one)',
    help: 'Installing two is cheap insurance: if an update breaks the main ' +
          'kernel you can boot the other one and fix it. linux-hardened ' +
          'trades some performance and some out-of-tree driver compatibility ' +
          'for exploit mitigations.',
    wiki: 'kernel-main',
    type: 'multi',
    options: [
        { value: 'linux', label: 'linux (mainline)', recommended: true,
          desc: 'Current stable. What most guidance assumes.' },
        { value: 'linux-lts', label: 'linux-lts', recommended: true,
          desc: 'Long-term support. The one you boot when an update breaks ' +
                'the other.' },
        { value: 'linux-hardened', label: 'linux-hardened',
          desc: 'Upstream hardening patches and stricter defaults. Some ' +
                'proprietary and out-of-tree modules will not build.' },
        { value: 'linux-zen', label: 'linux-zen',
          desc: 'Desktop responsiveness tuning.' }
    ],
    validate: v => (v && v.length) ? null : 'Pick at least one kernel — the system needs something to boot.'
},
{
    id: 'microcode',
    section: 'Boot',
    title: 'CPU microcode',
    help: 'Microcode updates fix CPU errata, including the ones behind ' +
          'speculative-execution vulnerabilities. Loaded early by the ' +
          'initramfs. There is no equivalent on ARM — firmware comes from the ' +
          'board vendor.',
    wiki: 'cpu_brand',
    // Not asked under a libre policy: microcode is a proprietary blob, so the
    // answer is already decided and offering it produced a summary that
    // disagreed with the packages actually installed.
    when: s => s.arch === 'x86_64' && s.libre !== 'yes',
    type: 'choice',
    options: [
        { value: 'intel-ucode', label: 'Intel', desc: 'Installs intel-ucode.' },
        { value: 'amd-ucode', label: 'AMD', desc: 'Installs amd-ucode.' },
        { value: 'none', label: 'Skip',
          desc: 'Only if you are enforcing a strictly libre policy — microcode ' +
                'is a proprietary blob.',
          note: 'Skipping leaves known CPU errata unmitigated.' }
    ]
},

/* ── System ────────────────────────────────────────────────────────────── */
{
    id: 'hostname',
    section: 'System',
    title: 'Hostname',
    help: 'The machine\'s name on your network. Letters, digits and hyphens.',
    wiki: 'manual-install',
    type: 'text',
    placeholder: 'archbox',
    validate: v => /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(v.trim())
        ? null
        : 'Letters, digits and hyphens only, and it cannot start or end with a hyphen.'
},
{
    id: 'username',
    section: 'System',
    title: 'Your username',
    help: 'The everyday account. It goes in the wheel group so it can use ' +
          'sudo; you should not be logging in as root.',
    wiki: 'manual-install',
    type: 'text',
    placeholder: 'you',
    validate: v => /^[a-z_][a-z0-9_-]{0,31}$/.test(v.trim())
        ? null
        : 'Lower-case letters, digits, underscore and hyphen, starting with a letter or underscore.'
},
{
    id: 'timezone',
    section: 'System',
    title: 'Time zone',
    help: 'An IANA zone name — the "Region/City" form. On the installed system ' +
          '"timedatectl list-timezones" lists every one of them. The hardware ' +
          'clock is kept in UTC; if you dual boot Windows the guide adds the ' +
          'step that stops the two disagreeing about the time.',
    wiki: 'manual-install',
    type: 'text',
    placeholder: 'Europe/London',
    /* Offer the browser's own zone as a one-click fill. It is the one answer
       this page can work out for itself, and typing "America/Argentina/Buenos_Aires"
       by hand on a phone is how people end up with the wrong clock. Still
       editable — a machine is not always installed in the zone it is set up in,
       and the detected value is presented as a suggestion, not an assumption. */
    suggest: () => {
        try {
            var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (!tz || tz.indexOf('/') === -1) return null;   // "UTC" alone is not a zone name
            return { value: tz, label: 'Use ' + tz, note: 'detected from your browser' };
        } catch (_) { return null; }        // very old engine, or Intl stripped
    },
    validate: v => /^[A-Za-z]+\/[A-Za-z_+-]+(\/[A-Za-z_+-]+)?$/.test(v.trim())
        ? null
        : 'Needs a zone such as Europe/London, America/New_York or Australia/Sydney.'
},
{
    id: 'locale',
    section: 'System',
    title: 'Locale',
    help: 'Sets language, date format, sort order and currency. UTF-8 ' +
          'variants only — anything else will bite you the first time a ' +
          'filename has an accent in it.',
    wiki: 'manual-install',
    type: 'choice',
    options: [
        { value: 'en_GB.UTF-8', label: 'en_GB.UTF-8', desc: 'British English.' },
        { value: 'en_US.UTF-8', label: 'en_US.UTF-8', recommended: true,
          desc: 'US English. What most documentation assumes.' },
        { value: 'de_DE.UTF-8', label: 'de_DE.UTF-8', desc: 'German.' },
        { value: 'fr_FR.UTF-8', label: 'fr_FR.UTF-8', desc: 'French.' }
    ]
},
{
    id: 'keymap',
    section: 'System',
    title: 'Console keymap',
    help: 'The console layout, used before any desktop starts. Get this ' +
          'wrong and your disk passphrase will not type the way you expect ' +
          'at the boot prompt.',
    wiki: 'manual-install',
    type: 'choice',
    options: [
        { value: 'us', label: 'us', recommended: true, desc: 'US QWERTY.' },
        { value: 'uk', label: 'uk', desc: 'UK QWERTY.' },
        { value: 'de', label: 'de', desc: 'German QWERTZ.' },
        { value: 'fr', label: 'fr', desc: 'French AZERTY.' }
    ]
},
{
    id: 'mirror_country',
    section: 'System',
    title: 'Which country for package mirrors?',
    help: 'reflector builds your pacman mirror list from the servers closest ' +
          'to you and ranks them by download speed, so the install pulls ' +
          'packages fast. Pick where you are — the guide fetches that country\'s ' +
          'mirrors, ranks them, and writes the list.',
    wiki: 'manual-install',
    type: 'choice',
    options: [
        { value: 'auto', label: 'Detect from my location (worldwide, ranked by speed)',
          recommended: true,
          desc: 'reflector picks the fastest recently-synced mirrors regardless ' +
                'of country. Safe default if you are unsure.' },
        { value: 'US', label: 'United States', desc: 'US mirrors.' },
        { value: 'GB', label: 'United Kingdom', desc: 'UK mirrors.' },
        { value: 'DE', label: 'Germany', desc: 'German mirrors.' },
        { value: 'FR', label: 'France', desc: 'French mirrors.' },
        { value: 'CA', label: 'Canada', desc: 'Canadian mirrors.' },
        { value: 'AU', label: 'Australia', desc: 'Australian mirrors.' },
        { value: 'NZ', label: 'New Zealand', desc: 'New Zealand mirrors.' },
        { value: 'JP', label: 'Japan', desc: 'Japanese mirrors.' },
        { value: 'SG', label: 'Singapore', desc: 'Singapore mirrors.' },
        { value: 'IN', label: 'India', desc: 'Indian mirrors.' },
        { value: 'BR', label: 'Brazil', desc: 'Brazilian mirrors.' },
        { value: 'NL', label: 'Netherlands', desc: 'Dutch mirrors.' },
        { value: 'SE', label: 'Sweden', desc: 'Swedish mirrors.' }
    ]
},
{
    id: 'mirror_https',
    section: 'System',
    title: 'Restrict mirrors to HTTPS?',
    help: 'HTTPS mirrors protect the package list and databases in transit. ' +
          'Package contents are signed and verified by pacman regardless, so ' +
          'plain HTTP is not a compromise of package integrity — but HTTPS ' +
          'hides which packages you are installing from anyone watching the ' +
          'connection, and is the safer default.',
    wiki: 'manual-install',
    type: 'bool',
    options: [
        { value: 'yes', label: 'HTTPS only', recommended: true,
          desc: 'reflector is told --protocol https, so only encrypted mirrors ' +
                'are used.' },
        { value: 'no', label: 'Allow HTTP too',
          desc: 'A larger mirror pool, occasionally faster. Package signatures ' +
                'still verify, but observers can see what you install.' }
    ]
},
/* ── Desktop ───────────────────────────────────────────────────────────── */
{
    id: 'desktop',
    section: 'Desktop',
    title: 'Desktop environment',
    help: 'Nothing here is required to have a working system. Get the base ' +
          'system booting first — debugging a desktop is much easier from ' +
          'something you know boots.',
    /* Says why Dusky is absent, on the systems where it is absent. Silence
       would read as an oversight; the reason is a real constraint and the
       reader may want to know it before choosing a system. */
    note: s => {
        const support = DUSKY_SUPPORT[osId(s)];
        return support.ok ? '' : 'Dusky is not offered on ' + osName(s) + '. ' + support.why;
    },
    wiki: 'desktop',
    type: 'choice',
    options: [
        { value: 'dusky', label: 'Dusky (preconfigured Hyprland rice)',
          desc: 'A complete Hyprland-on-Wayland desktop by dusklinux, installed ' +
                'from its own scripts. It is a dotfiles project, not a separate ' +
                'operating system — you are still running Arch. It brings its ' +
                'own Waybar, Rofi, Swaync and Wlogout, and decides your ' +
                'compositor, shell, font and colour scheme, so those questions ' +
                'lock and each one says what Dusky set it to.',
          note: 'Locks display server, shell, font and palette. Repo: ' + DUSKY_REPO +
                ' · Video: ' + DUSKY_VIDEO,
          /* Offered only where it can actually be installed. Dusky is Hyprland,
             which is wlroots on Wayland — see DUSKY_SUPPORT below for why that
             rules three systems out. The question's own note says which one you
             are on and why it is missing, because an option that silently is
             not there reads as an oversight rather than a constraint. */
          when: s => DUSKY_SUPPORT[osId(s)].ok,
          locks: DUSKY_LOCKS },
        { value: 'hyprland', label: 'Hyprland (unconfigured)', recommended: true,
          desc: 'The compositor, with none of the rice. You configure it.' },
        { value: 'dwm', label: 'dwm',
          desc: 'Suckless tiling window manager on Xorg. Configured by ' +
                'recompiling it.' },
        { value: 'gnome', label: 'GNOME', desc: 'Full desktop, Wayland by default.' },
        { value: 'kde', label: 'KDE Plasma', desc: 'Full desktop, very configurable.' },
        { value: 'none', label: 'No GUI',
          desc: 'A console. Correct for a server, and the fastest way to a ' +
                'system you understand.' }
    ]
},
{
    id: 'display_server',
    section: 'Desktop',
    title: 'Display server',
    help: 'Wayland isolates clients from each other, so one window cannot ' +
          'read another\'s keystrokes or screen. Xorg cannot make that ' +
          'guarantee, but some older applications and some accessibility ' +
          'tools still need it.',
    wiki: 'display_server',
    when: s => s.desktop && s.desktop !== 'none',
    type: 'choice',
    options: [
        { value: 'wayland', label: 'Wayland', recommended: true,
          desc: 'Client isolation by design. The default for Hyprland, GNOME ' +
                'and Plasma.' },
        { value: 'xorg', label: 'Xorg',
          desc: 'Required by dwm and some legacy applications. Any X client ' +
                'can read any other X client\'s input.' }
    ]
},
{
    id: 'font',
    section: 'Desktop',
    title: 'Monospace font',
    help: 'The font your terminal and editor use. Nerd Font variants include ' +
          'the glyphs that status bars and shell prompts expect; without ' +
          'them you get boxes.',
    wiki: 'desktop',
    when: s => s.desktop && s.desktop !== 'none',
    type: 'choice',
    options: [
        { value: 'jetbrains-mono-nerd', label: 'JetBrains Mono Nerd Font', recommended: true,
          desc: 'ttf-jetbrains-mono-nerd. Wide, very legible, full glyph coverage.' },
        { value: 'fira-code-nerd', label: 'FiraCode Nerd Font',
          desc: 'ttf-firacode-nerd. Programming ligatures.' },
        { value: 'cascadia-code', label: 'Cascadia Code',
          desc: 'ttf-cascadia-code-nerd. Microsoft\'s terminal font.' },
        { value: 'iosevka', label: 'Iosevka',
          desc: 'ttc-iosevka. Narrow — fits more columns on a small screen.' },
        { value: 'hack', label: 'Hack',
          desc: 'ttf-hack-nerd. Plain and dependable.' }
    ]
},
{
    id: 'palette',
    section: 'Desktop',
    title: 'Colour palette',
    help: 'Applied to the terminal, the editor and the shell prompt so they ' +
          'agree with each other. All of these are dark schemes designed for ' +
          'long sessions.',
    wiki: 'desktop',
    when: s => s.desktop && s.desktop !== 'none',
    type: 'choice',
    options: [
        { value: 'tokyo-night', label: 'Tokyo Night', recommended: true,
          desc: 'What this site uses. Deep blue-grey with magenta and cyan accents.' },
        { value: 'catppuccin-mocha', label: 'Catppuccin Mocha', desc: 'Soft, low contrast, pastel.' },
        { value: 'gruvbox-dark', label: 'Gruvbox Dark', desc: 'Warm, retro, high contrast.' },
        { value: 'nord', label: 'Nord', desc: 'Cool arctic blues, deliberately muted.' },
        { value: 'dracula', label: 'Dracula', desc: 'Purple and pink on near-black.' },
        { value: 'rose-pine', label: 'Rosé Pine', desc: 'Muted rose and pine, low glare.' },
        { value: 'everforest', label: 'Everforest', desc: 'Green, soft, easy on the eyes.' }
    ]
},
/* ── Wallpapers ─────────────────────────────────────────────────────────────
   dusklinux publishes a wallpaper collection separately from Dusky itself, so it
   is offered to everyone with a desktop rather than only to Dusky users — the
   images have nothing to do with the compositor.

   Counts are real, checked against the repository: dark/ has 135 files and
   light/ has 134, so 269 in total at roughly 65–285 KB each — about 40 MB for
   the lot. That is why the count is a question rather than an assumption. */
{
    id: 'wallpapers',
    section: 'Desktop',
    title: 'Wallpapers',
    help: 'dusklinux publishes 269 wallpapers — 135 dark and 134 light. This is ' +
          'a separate collection from Dusky itself, so you can take the ' +
          'wallpapers without the desktop or the desktop without the ' +
          'wallpapers. Downloading all of them is about 40 MB.',
    wiki: 'desktop',
    when: s => s.desktop && s.desktop !== 'none',
    type: 'choice',
    options: [
        { value: 'none', label: 'None', recommended: true,
          desc: 'Skip it. Nothing is downloaded and no directory is created.' },
        { value: 'dark', label: 'Dark only',
          desc: '135 available. Matches every palette offered above, all of which are dark.' },
        { value: 'light', label: 'Light only',
          desc: '134 available. For a light desktop, or a bright room.' },
        { value: 'mixed', label: 'A mix of both',
          desc: 'Both folders, split by the percentage you choose next.' },
        /* Reachable before only as mixed + "every one" + a split that then
           divided them anyway, which is three answers to say one thing and
           never quite produced the whole set. */
        { value: 'all', label: 'All of them — both sets, everything',
          desc: 'Every one of the 269: all 135 dark and all 134 light. ' +
                'No count and no split to choose. About 40 MB.' }
    ]
},
{
    id: 'wallpaper_count',
    section: 'Desktop',
    title: 'How many wallpapers?',
    help: 'Picked at random from the collection each time the command runs, so ' +
          'you get a different set rather than always the first N. All 269 is ' +
          'about 40 MB; 50 is about 7 MB.',
    wiki: 'desktop',
    // 'all' already answers this — asking how many of "all of them" you want
    // would be a question with one possible answer.
    when: s => s.wallpapers && s.wallpapers !== 'none' && s.wallpapers !== 'all',
    type: 'choice',
    options: [
        { value: '10',  label: '10',  desc: 'About 1.5 MB. Enough to try the look.' },
        { value: '25',  label: '25',  desc: 'About 4 MB.' },
        { value: '50',  label: '50',  recommended: true, desc: 'About 7 MB. Plenty for a rotation.' },
        { value: '100', label: '100', desc: 'About 15 MB.' },
        { value: 'all', label: 'Every one',
          desc: 'All 269, about 40 MB. Capped at what the chosen folders actually hold.' }
    ]
},
{
    id: 'wallpaper_split',
    section: 'Desktop',
    title: 'How should the mix be split?',
    help: 'The share taken from the dark folder; the rest comes from light. ' +
          'Rounded to whole images, and capped at what each folder holds.',
    wiki: 'desktop',
    when: s => s.wallpapers === 'mixed',
    type: 'choice',
    options: [
        { value: '90', label: '90% dark / 10% light', desc: 'Almost all dark, a few light.' },
        { value: '75', label: '75% dark / 25% light', recommended: true,
          desc: 'Mostly dark. Matches the palettes offered above.' },
        { value: '50', label: '50% dark / 50% light', desc: 'An even split.' },
        { value: '25', label: '25% dark / 75% light', desc: 'Mostly light.' },
        { value: '10', label: '10% dark / 90% light', desc: 'Almost all light.' }
    ]
},
{
    id: 'shell',
    section: 'Desktop',
    title: 'Login shell',
    help: 'bash is what every guide on the internet assumes. zsh with a ' +
          'prompt framework is the common upgrade. fish is friendlier out of ' +
          'the box but is not POSIX, so pasted shell snippets can fail.',
    wiki: 'desktop',
    type: 'choice',
    options: [
        { value: 'bash', label: 'bash', recommended: true, desc: 'Default. Nothing to install.' },
        { value: 'zsh', label: 'zsh', desc: 'Completion and prompt customisation.' },
        { value: 'fish', label: 'fish', desc: 'Good defaults, not POSIX-compatible.' }
    ]
},
{
    id: 'ricing',
    section: 'Desktop',
    title: 'Ricing toolkit — the pieces that make a window manager usable',
    help: 'A bare tiling window manager has no bar, no launcher, no notifications ' +
          'and no wallpaper — you assemble those yourself. This is where a rice ' +
          'comes from. Pick the pieces you want; the guide installs and points ' +
          'you at configuring each. These are separate from ordinary apps ' +
          'because they define the desktop rather than run on it. Dusky ships ' +
          'its own set preconfigured, so this is skipped when you pick it.',
    wiki: 'advanced-config-themes',
    optional: true,
    when: s => s.desktop && ['hyprland', 'dwm'].indexOf(s.desktop) !== -1,
    type: 'multi',
    options: [
        { value: 'rofi', label: 'rofi / wofi — app launcher', recommended: true,
          desc: 'The search-and-launch menu. wofi is the Wayland-native one; ' +
                'rofi works on both and is what Dusky uses.' },
        { value: 'waybar', label: 'waybar / polybar — status bar', recommended: true,
          desc: 'The top bar: workspaces, clock, battery, tray. waybar on ' +
                'Wayland, polybar on Xorg.' },
        { value: 'dunst', label: 'dunst / mako — notifications', recommended: true,
          desc: 'Draws desktop notifications. mako on Wayland, dunst on Xorg.' },
        { value: 'wallpaper', label: 'hyprpaper / feh — wallpaper',
          desc: 'Sets the desktop background. hyprpaper on Wayland, feh on Xorg.' },
        { value: 'picom', label: 'picom — compositor (Xorg only)',
          when: s => s.display_server === 'xorg',
          desc: 'Shadows, transparency and vsync on Xorg. Wayland compositors ' +
                'do this themselves.' },
        { value: 'lockscreen', label: 'hyprlock / swaylock — lock screen',
          desc: 'Locks the session to a password prompt.' },
        { value: 'idle', label: 'hypridle / swayidle — idle management',
          desc: 'Locks or sleeps after inactivity.' },
        { value: 'clipboard', label: 'cliphist / clipman — clipboard history',
          desc: 'Keeps a searchable clipboard history.' },
        { value: 'screenshot', label: 'grim + slurp / flameshot — screenshots',
          desc: 'Region and window screenshots.' }
    ]
},

/* ── Services ──────────────────────────────────────────────────────────── */
{
    id: 'network',
    section: 'Services',
    title: 'Network management',
    help: 'Pick exactly one. Two network managers fighting over the same ' +
          'interface is a classic way to end up with no network at all.',
    wiki: 'firewall',
    type: 'choice',
    options: [
        { value: 'networkmanager', label: 'NetworkManager', recommended: true,
          desc: 'Works with every desktop, handles wifi roaming and VPNs.' },
        { value: 'systemd-networkd', label: 'systemd-networkd + iwd',
          desc: 'Lighter, declarative, no daemon beyond systemd. Better on a server.' },
        { value: 'iwd', label: 'iwd alone',
          desc: 'Wireless only, minimal. You configure addressing yourself.' }
    ]
},
/* ── DNS ────────────────────────────────────────────────────────────────────
   Whoever answers your DNS queries sees every domain you visit, before any
   encryption in the browser applies. By default that is your ISP, on the wire,
   in plaintext. This picks the upstream and turns on DNS-over-TLS.

   Addresses checked against each provider's own documentation. "No logs" is a
   published policy, not something you can verify from here — the options say
   what each provider claims and who they are, and let you decide. */
{
    id: 'dns_provider',
    section: 'Services',
    title: 'Who answers your DNS queries?',
    help: 'Every site you visit starts with a DNS lookup, and by default that ' +
          'goes to your ISP unencrypted — visible to them and to anyone on the ' +
          'path, regardless of HTTPS. Picking a provider here also enables ' +
          'DNS-over-TLS and DNSSEC, so the queries are encrypted and the ' +
          'answers are authenticated.',
    wiki: 'encrypted-dns',
    type: 'choice',
    options: [
        { value: 'quad9', label: 'Quad9 — 9.9.9.9', recommended: true,
          desc: 'Swiss non-profit foundation. Blocks known-malicious domains ' +
                'at the resolver, and states it does not log the querying IP. ' +
                'DNS-over-TLS at dns.quad9.net.' },
        { value: 'mullvad', label: 'Mullvad DNS — 194.242.2.2',
          desc: 'Run by the VPN provider, usable without a subscription. ' +
                'States no logging. DNS-over-TLS at dns.mullvad.net.' },
        { value: 'cloudflare', label: 'Cloudflare — 1.1.1.1',
          desc: 'Fast and very widely used. Publishes a no-logging policy with ' +
                'third-party audits. DNS-over-TLS at cloudflare-dns.com.',
          note: 'A single very large company sees a large share of the ' +
                'internet\'s DNS. That is a centralisation trade-off, not a ' +
                'technical fault.' },
        { value: 'dns0', label: 'dns0.eu — 193.110.81.0',
          desc: 'European non-profit, GDPR-scoped, states no logging. ' +
                'DNS-over-TLS at dns0.eu.' },
        { value: 'adguard', label: 'AdGuard DNS — 94.140.14.14',
          desc: 'Blocks advertising and tracking domains at the resolver, so ' +
                'it applies to every device and every application, not just a ' +
                'browser. DNS-over-TLS at dns.adguard-dns.com.' },
        { value: 'isp', label: 'Whatever DHCP hands out',
          desc: 'Your ISP or your router. No extra configuration, and no ' +
                'encryption unless they happen to offer it.',
          note: 'Your ISP sees every domain you look up, in plaintext.' }
    ]
},
{
    id: 'dns_ipv4_only',
    section: 'Services',
    title: 'Does this network have working IPv6?',
    help: 'Only asked because getting it wrong is confusing rather than ' +
          'obviously broken. If systemd-resolved is given an IPv6 resolver on ' +
          'a network with no working IPv6, lookups do not fail cleanly — they ' +
          'go intermittent while it waits on an address that will never ' +
          'answer, which reads as "DNS is broken" rather than "there is no ' +
          'IPv6 here".',
    wiki: 'encrypted-dns',
    when: s => !!s.dns_provider && s.dns_provider !== 'none',
    type: 'single',
    optional: true,
    options: [
        { value: 'no', label: 'Yes, or I am not sure', recommended: true,
          desc: 'Uses both the IPv4 and IPv6 resolvers. The right answer almost ' +
                'everywhere — if IPv6 works, you get it; if it is simply absent ' +
                'rather than broken, nothing tries to use it.' },
        { value: 'yes', label: 'No — IPv4 only',
          desc: 'Uses only the provider\'s IPv4 addresses. Pick this if you know ' +
                'IPv6 is half-configured on this network: advertised but not ' +
                'actually routable is the case that causes the intermittent ' +
                'behaviour above.' }
    ]
},
{
    id: 'audio',
    section: 'Services',
    title: 'Audio',
    help: 'PipeWire replaced PulseAudio and JACK and is what Arch ships now. ' +
          'Choose none for a server.',
    wiki: 'desktop',
    when: s => s.desktop && s.desktop !== 'none',
    type: 'choice',
    options: [
        { value: 'pipewire', label: 'PipeWire', recommended: true,
          desc: 'pipewire, pipewire-pulse, wireplumber.' },
        { value: 'none', label: 'No audio', desc: 'Server, or you will set it up later.' }
    ]
},
{
    id: 'firewall',
    section: 'Services',
    title: 'Firewall',
    help: 'A default-deny inbound policy closes everything you did not ' +
          'deliberately open. Two commands, and it is the highest ' +
          'security-per-effort item in this whole guide.',
    wiki: 'firewall-profiles',
    type: 'choice',
    options: [
        { value: 'ufw', label: 'UFW, default deny inbound', recommended: true,
          desc: 'Simple front end to nftables. Easy to reason about.' },
        { value: 'nftables', label: 'nftables directly',
          desc: 'No abstraction layer. You write the ruleset.' },
        { value: 'none', label: 'No firewall',
          desc: 'Everything you run that listens is reachable from your network.',
          danger: 'Any service that binds a port is exposed to your whole network.' }
    ]
},
{
    id: 'snapshots',
    section: 'Services',
    title: 'Snapshots',
    help: 'A snapshot taken automatically before every pacman transaction ' +
          'turns a broken update into a reboot. Only useful on Btrfs.',
    wiki: 'filesystem',
    when: s => s.filesystem === 'btrfs',
    type: 'choice',
    options: [
        { value: 'snapper', label: 'Snapper + snap-pac', recommended: true,
          desc: 'Automatic pre/post snapshots around every pacman run.' },
        { value: 'timeshift', label: 'Timeshift', desc: 'Simpler, GUI-driven.' },
        { value: 'none', label: 'None', desc: 'You can add it later.' }
    ]
},

/* ── Security ──────────────────────────────────────────────────────────── */
{
    id: 'security_tools',
    section: 'Security',
    title: 'Which security tools?',
    help: 'Read what each one does before enabling it. Several can lock you ' +
          'out of your own machine, which is the point of them, and the ' +
          'reason none are enabled automatically.',
    wiki: 'security-suite',
    type: 'multi',
    optional: true,
    options: [
        { value: 'libre-otp', label: 'Libre OTP',
          when: s => !window.osToolSupport || window.osToolSupport(osId(s), 'libre-otp') !== 'no',
          desc: 'TOTP/HOTP second factor with no cloud account and no blobs.' },
        { value: 'anti-ducky', label: 'Anti-Ducky',
          when: s => !window.osToolSupport || window.osToolSupport(osId(s), 'anti-ducky') !== 'no',
          desc: 'Blocks BadUSB keystroke injection by watching HID timing.',
          note: 'Its timing thresholds have never been measured on real ' +
                'hardware. Test it before trusting it with your only keyboard.' },
        { value: 'anti-evil-maid', label: 'Anti-Evil Maid',
          when: s => !window.osToolSupport || window.osToolSupport(osId(s), 'anti-evil-maid') !== 'no',
          desc: 'Hashes /boot so you know if it changed while the machine ' +
                'was out of your hands.' },
        { value: 'kernel-watcher', label: 'Kernel Watcher',
          when: s => !window.osToolSupport || window.osToolSupport(osId(s), 'kernel-watcher') !== 'no',
          desc: 'Watches SSH keys, browser profiles and wallet directories ' +
                'for readers.' },
        { value: 'scarecrow', label: 'Scarecrow',
          when: s => !window.osToolSupport || window.osToolSupport(osId(s), 'scarecrow') !== 'no',
          desc: 'Canary files and sandbox spoofing.',
          danger: 'Its duress mode can destroy data. Off by default and gated ' +
                  'behind typed confirmation.' },
        /* Arch only, and hidden rather than disabled elsewhere. The AUR is an
           Arch institution: there is no PKGBUILD on Gentoo, FreeBSD or
           OpenBSD, so the tool has nothing to read. Offering it there would be
           a control that installs a binary which can never do anything —
           exactly the class of dead feature this project keeps removing.

           Gentoo's ebuilds and FreeBSD's ports Makefiles are the analogous
           thing and would each need their own auditor; that is a separate tool,
           not a flag on this one. */
        { value: 'aur-guard', label: 'AUR Guard',
          when: s => osId(s) === 'arch',
          desc: 'Audits a PKGBUILD for malicious patterns before makepkg ' +
                'runs it. Read-only; it cannot lock you out. Arch only — the ' +
                'AUR does not exist on the other systems.' },
        /* Pi hardware only, and correct about that. It reads the EEPROM
           bootloader state, which exists nowhere else. */
        { value: 'pi-boot-guard', label: 'Pi Boot Guard',
          when: s => osId(s) === 'raspios',
          desc: 'Reports Raspberry Pi secure-boot state and baselines the boot ' +
                'partition. It refuses to fuse OTP — that is irreversible — and ' +
                'prints the steps instead.' }
    ],
    /* Say what only half runs.

       Support comes from os-install.js, which mirrors the installer's table and
       is held to it by tests/tool-support.mjs. Tools the installer would refuse
       are hidden by each option's own `when` above — offering one would mean the
       reader picks it, generates a script, and finds out on the machine.

       "partial" is never left as a bare word. Which half works is the whole
       question: boot hashing without the lock-on-tamper half is still worth
       having, and knowing that is the difference between a useful tool and a
       false sense of one. */
    note: s => {
        if (!window.osToolSupport || !window.osToolReason) return '';
        const ALL = ['libre-otp', 'anti-ducky', 'anti-evil-maid', 'kernel-watcher',
                     'scarecrow', 'aur-guard', 'pi-boot-guard'];
        const describe = t => t + ' — ' + (window.osToolReason(osId(s), t) ||
                                           'not supported on this system');
        const partial = ALL.filter(t => window.osToolSupport(osId(s), t) === 'partial');
        /* Absent tools are named too. A shorter list with no explanation
           teaches the reader nothing — they cannot tell whether the tool does
           not exist, does not apply here, or was forgotten. Naming it is also
           the only way they learn that OpenBSD's missing PAM is what removed
           two of these, rather than an oversight. */
        const absent = ALL.filter(t => window.osToolSupport(osId(s), t) === 'no');
        const parts = [];
        if (partial.length) {
            parts.push('These work only in part: ' + partial.map(describe).join('; ') + '.');
        }
        if (absent.length) {
            parts.push('Not offered here, and why: ' + absent.map(describe).join('; ') + '.');
        }
        if (!parts.length) return '';
        return 'On ' + osName(s) + '. ' + parts.join(' ');
    }
},
{
    /* How the tools get onto the machine, which the generator has always asked
       and this side never did. It is a packaging choice rather than a tool:
       the same five daemons either as five signed binaries or as one that
       dispatches to whichever you invoke.

       Only asked when something was selected - a question about how to install
       nothing is a question with no answer. */
    id: 'security_tools_packaging',
    section: 'Security',
    title: 'Separate binaries, or the all-in-one suite?',
    help: 'The same tools either way. The suite is one signed binary that ' +
          'dispatches to whichever you ask for, so there is one hash and one ' +
          'signature to check instead of five, and one file to update. ' +
          'Separate binaries let you install only what you want and leave the ' +
          'rest off the disk entirely.',
    wiki: 'suite-installer',
    when: s => Array.isArray(s.security_tools) && s.security_tools.length > 0,
    type: 'choice',
    options: [
        { value: 'separate', label: 'Separate binaries', recommended: true,
          desc: 'One binary per tool. Only what you chose is installed, and a ' +
                'tool you never enable is not on the disk to be found.' },
        { value: 'suite', label: 'One all-in-one binary',
          desc: 'unix-security-suite. One hash and one signature to verify, ' +
                'one file to keep updated, and it carries every tool whether ' +
                'or not you enable them. This is the build the site recommends.' }
    ]
},
/* ── Duress PINs ────────────────────────────────────────────────────────────
   Only offered when scarecrow is installed and the disk is actually encrypted:
   a duress PIN erases a LUKS header, and there is no header to erase on an
   unencrypted install. Offering it there would be a control that silently does
   nothing, which is worse than not offering it. */
{
    id: 'duress_pins',
    section: 'Security',
    title: 'Duress PINs',
    // "at the LUKS prompt" was wrong and it mattered: these are checked at the
    // *login* prompt, by a PAM gate. Someone who believed otherwise would type
    // their duress PIN at the boot passphrase prompt, where it is just a wrong
    // passphrase and nothing happens — at the one moment it needed to work.
    help: 'Three separate passwords you can set at the login prompt, each ' +
          'optional. They exist for the situation where someone is standing ' +
          'over you demanding a password. Nothing on screen ever reveals that ' +
          'one was used — that is the whole point, and it is why none of them ' +
          'announce themselves.',
    wiki: 'luks-duress',
    when: s => (s.security_tools || []).indexOf('scarecrow') !== -1 &&
               s.encryption && s.encryption !== 'none',
    type: 'multi',
    optional: true,
    options: [
        { value: 'duress', label: 'Duress — erase, silently',
          desc: 'Erases the LUKS header. The data becomes unrecoverable. It ' +
                'then behaves exactly like a wrong password, because a disk ' +
                'that will not unlock reads as a forgotten passphrase.',
          danger: 'Irreversible without a header backup. Take one first, and ' +
                  'keep it where the person you are hiding from cannot reach it.' },
        { value: 'decoy', label: 'Decoy — a plausible session',
          desc: 'Opens a working session in a decoy home while your real data ' +
                'stays sealed. Erases nothing. An obviously empty decoy home ' +
                'is itself a tell, so populate it.' },
        { value: 'both', label: 'Both at once — erase and show a decoy',
          desc: 'Erases the header and opens the decoy session, so the data ' +
                'is gone and the screen still shows a working system. For ' +
                'when you need both and cannot afford either to be visible.',
          danger: 'Irreversible without a header backup, same as duress.' }
    ]
},
/* ── Anti-Ducky response ───────────────────────────────────────────────────
   Only asked when Anti-Ducky is actually installed. The capture and the
   deauthorization happen regardless; this is the *extra* response, and the two
   ends of it have very different costs. */
{
    id: 'ducky_response',
    section: 'Security',
    title: 'What should Anti-Ducky do when it catches a payload?',
    help: 'It always captures the payload and deauthorizes the device at the ' +
          'kernel, whatever you pick here. This is what happens on top of that.',
    wiki: 'anti-ducky',
    when: s => (s.security_tools || []).indexOf('anti-ducky') !== -1,
    type: 'single',
    optional: true,
    options: [
        { value: 'lock', label: 'Lock every session', recommended: true,
          desc: 'The attacker cannot use the unlocked desktop the injected ' +
                'keystrokes were aimed at. If it misfires you lose a login, ' +
                'not your work. It does not protect the encryption keys in ' +
                'RAM — a lock screen is a UI, not a cryptographic boundary.' },
        { value: 'alert', label: 'Alert only',
          desc: 'The device is already blocked and the payload already saved. ' +
                'Doing nothing further is a legitimate choice.' },
        { value: 'lockdown', label: 'Full lockdown, then power off',
          desc: 'In order: lock every session, raise the kernel lockdown level ' +
                'to confidentiality (closing /dev/mem, kexec and unsigned ' +
                'module loading), suspend the LUKS volume so the master key ' +
                'leaves RAM, then cut power. A plain power-off leaves several ' +
                'seconds where the key is still in RAM and the desktop is still ' +
                'unlocked behind whatever the payload typed; this closes each ' +
                'of those first.',
          danger: 'Loses unsaved work exactly as a power-off does. The LUKS ' +
                  'step needs anti-evil-maid installed and configured — without ' +
                  'it the lockdown still locks and still powers off, it just ' +
                  'cannot flush the key. Requires typed confirmation to arm.' },
        { value: 'poweroff', label: 'Hard power-off',
          desc: 'Cuts power so the disk-encryption keys leave RAM before ' +
                'anyone can pull the DIMMs for a cold-boot read.',
          danger: 'Loses unsaved work, with no confirmation, on a false ' +
                  'positive. Anti-Ducky\'s timing thresholds have never been ' +
                  'measured on real hardware, so its false-positive rate is ' +
                  'unknown. Requires typed confirmation to arm.' }
    ]
},
/* ── Lock screen as a real barrier ──────────────────────────────────────────
   Separate from the idle timer: "when I lock the screen" and "after N minutes
   idle" are different intentions, and someone can reasonably want one without
   the other. */
{
    id: 'luks_lock_on_screen',
    section: 'Security',
    title: 'Make the lock screen a cryptographic barrier?',
    help: 'Locking your session hides the desktop. It does nothing to the LUKS ' +
          'master key, which stays in kernel memory the whole time — so to ' +
          'anyone with a DMA port or a can of freeze spray, a locked screen ' +
          'and an unlocked one are the same machine.',
    wiki: 'luks-autolock',
    when: s => (s.security_tools || []).indexOf('anti-evil-maid') !== -1 &&
               s.encryption && s.encryption !== 'none',
    type: 'single',
    optional: true,
    options: [
        { value: 'no', label: 'No — screen lock only',
          desc: 'Your login password gets you back in. The disk key stays ' +
                'resident the whole time you are away.' },
        { value: 'yes', label: 'Yes — suspend LUKS when the screen locks',
          recommended: true,
          desc: 'A watcher listens for the session-lock signal and suspends the ' +
                'volume, so getting back in needs the disk passphrase, not just ' +
                'your login password. That is what makes it a boundary rather ' +
                'than a UI.' }
    ],
    note: 'Test this before relying on it. Suspending the volume that backs / ' +
          'freezes every disk read until the passphrase is entered, so the ' +
          'first time your screensaver fires you had better be able to type it.'
},
/* ── LUKS auto-lock ─────────────────────────────────────────────────────────
   Encryption-only for the obvious reason, and anti-evil-maid-only because that
   is the crate that ships `--lock-now`. Offering it without either would be a
   control that configures nothing. */
{
    id: 'luks_autolock',
    section: 'Security',
    title: 'Lock the disk when you step away?',
    help: 'Locking your screen leaves the LUKS master key sitting in kernel ' +
          'memory, where a DMA port or a cold-boot attack on the RAM can still ' +
          'reach it. Suspending the volume flushes that key, so the disk is as ' +
          'protected as it is when the machine is off.',
    wiki: 'luks-autolock',
    when: s => (s.security_tools || []).indexOf('anti-evil-maid') !== -1 &&
               s.encryption && s.encryption !== 'none',
    type: 'single',
    optional: true,
    options: [
        { value: 'never', label: 'No auto-lock',
          desc: 'You can still lock on demand with `anti-evil-maid --lock-now`.' },
        { value: '15m', label: 'After 15 minutes idle', recommended: true,
          desc: 'Long enough not to interrupt you, short enough that a machine ' +
                'left on a desk is not open all afternoon.' },
        { value: '1h', label: 'After 1 hour idle',
          desc: 'For a machine you leave running but stay near.' },
        { value: '8h', label: 'After 8 hours idle',
          desc: 'Effectively overnight. Little protection during the day.' },
        { value: 'on-lock', label: 'Whenever the session locks',
          desc: 'The key stops being resident the moment you lock the screen, ' +
                'which is when you have decided you are done.' }
    ],
    note: 'Suspending the volume that backs / freezes every disk read until ' +
          'you type the passphrase. Test it once while you can still reach ' +
          'the machine physically — a mistake needs a power cycle.'
},
{
    id: 'apps',
    section: 'Software',
    title: 'Post-install software',
    help: 'Installed and configured after the first boot, not during the ' +
          'base install. Anything needing a decision from you is asked at ' +
          'that point rather than guessed.',
    /* Two applications that do the same job. Not blocked, and not treated as a
       mistake - but named, with what actually separates them, because working
       down a list of checkboxes is how somebody ends up with two of something
       without meaning to. Same table as the generator's smart analysis, so the
       two front ends cannot end up telling the reader different things. */
    note: function (s) {
        if (typeof window === 'undefined' || typeof window.appOverlaps !== 'function') return '';
        var hits = window.appOverlaps(s.apps || []);
        if (!hits.length) return '';
        return hits.map(function (o) {
            return window.appOverlapText(o).join(' ');
        }).join(' ');
    },
    wiki: 'advanced-config',
    optional: true,
    type: 'multi',
    /* Built from the shared catalogue rather than written out here.

       These two lists had drifted to 34 options against 13, with four the
       walkthrough offered and the generator did not — so the same walkthrough
       and generator produced genuinely different machines from what a reader
       would call the same answers. Reading one table is what stops that
       happening again; `tests/app-parity.mjs` fails if either front end starts
       keeping its own list.

       An AUR-only application is marked in its label rather than hidden,
       because on Arch it is a real option with a real cost, and on a system
       with no AUR the emitter drops it and says so. */
    options: (function () {
        var cat = (typeof window !== 'undefined' && window.APPS) || [];
        return cat.map(function (a) {
            return {
                value: a.id,
                label: a.label + (a.aur ? ' (AUR)' : ''),
                recommended: a.id === 'git',
                desc: a.desc || a.blurb
            };
        });
    })()
},
{
    id: 'extra_packages',
    section: 'Software',
    title: 'Anything else?',
    help: 'Package names, separated by spaces. Search the official repos and ' +
          'the AUR below, or type names you already know. Leave it empty to ' +
          'skip.',
    wiki: 'advanced-config',
    type: 'text',
    optional: true,
    // Renders the live search panel. The search is a convenience: if it cannot
    // reach the APIs the field still works as a plain text box, which is why
    // nothing downstream depends on a package having been found here.
    search: 'packages',
    placeholder: 'e.g. ripgrep fd bat',
    validate: function (v) {
        if (!v) return null;
        // Deliberately permissive — this is checked again on the machine, where
        // the real package database is. Rejecting a valid name here because the
        // pattern was too strict is worse than passing an unknown one through
        // to a warning. Arch package names allow @ . _ + - and alphanumerics.
        var bad = v.split(/\s+/).filter(function (p) {
            return p && !/^[a-z0-9@._+-]+$/i.test(p);
        });
        return bad.length
            ? 'Not valid package names: ' + bad.join(', ')
            : null;
    }
},
{
    id: 'buskill',
    section: 'Security',
    title: 'BusKill dead-man switch?',
    help: 'BusKill is a magnetic USB cable. Pull the laptop away — or have ' +
          'it pulled away — and the magnet separates, the USB device ' +
          'disappears, and udev fires a rule. It turns physical separation ' +
          'from the machine into an event you can act on.',
    wiki: 'usb-kill',
    optional: true,
    type: 'choice',
    options: [
        { value: 'none', label: 'No', recommended: true, desc: 'Skip it.' },
        { value: 'lock', label: 'Yes — lock the session',
          desc: 'Non-destructive. Locks the screen on disconnect. You can ' +
                'always get back in.' },
        { value: 'shutdown', label: 'Yes — shut down',
          desc: 'Cuts power, so the encryption keys leave RAM.',
          danger: 'Unsaved work is lost on every accidental disconnect. ' +
                  'Rehearse it before relying on it.' }
    ]
},
{
    id: 'verbosity',
    section: 'Output',
    title: 'How much should the generated script say?',
    help: 'Debug injects "set -x", so bash prints every command with its ' +
          'arguments before running it. That is what you want the first time ' +
          'something fails.',
    wiki: 'advanced-config-verbosity',
    type: 'choice',
    options: [
        { value: 'normal', label: 'Normal', recommended: true, desc: 'Standard pacman and configuration output.' },
        { value: 'quiet', label: 'Quiet', desc: 'Errors only.' },
        { value: 'debug', label: 'Debug (set -x)', desc: 'Every command echoed before it runs.' }
    ]
}
];

/* The OS helpers are exported for the emitters and the tests. Every
   OS-specific string must go through `osName`/`osMeta` rather than reading
   `s.os` directly, so a skipped selection resolves to Arch in exactly one
   place instead of needing a fallback at every call site. */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STEPS, DUSKY_LOCKS, DUSKY_VIDEO, OS_LOCKS,
        OS_META, osId, osMeta, osName, isLinux
    };
}
