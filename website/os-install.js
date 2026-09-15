/* ============================================================================
   os-install.js — how each system actually installs, described once.
   ----------------------------------------------------------------------------
   os-meta.js says which systems exist and what they are called. This says what
   their commands are: how the base system gets onto the disk, how packages are
   installed, how services are enabled, and what each package is called there.

   Why it is a table rather than branches inside the emitters: the generator and
   the walkthrough both emit install commands, and every `if (os === 'gentoo')`
   written inside one of them is a chance for the two to disagree about what a
   Gentoo install looks like. They read the same table instead.

   ── The Arch entry must not change its output ───────────────────────────────
   Arch's templates reproduce, character for character, the commands that were
   hard-coded in the emitters before this file existed. `tests/permutations.mjs`
   holds 578 configs and 16,319 assertions against that output, and the standing
   constraint is that the count does not fall while other systems are added. If
   an Arch string here needs editing, that is a change to the Arch guide and
   should be made deliberately, not as a side effect of adding a system.

   ── Systems that are not built yet are absent, not approximated ─────────────
   A missing entry throws. That is the point: the failure this project keeps
   finding is a guide that silently prints one system's commands under another
   system's name, and an entry filled in with Arch's commands "for now" is
   exactly that bug with a table around it.

   Authority per system, cited because the commands came from there:
     Arch    — https://wiki.archlinux.org/title/Installation_guide
     Gentoo  — https://wiki.gentoo.org/wiki/Handbook:AMD64

   No dependencies. Exports onto the global object so it works both as a classic
   script in the browser and inside the test harnesses, which concatenate the
   website's scripts into one scope.
   ========================================================================= */

'use strict';

(function (root) {

    /* ── Package names ──────────────────────────────────────────────────────
       Keyed by the Arch name, because that is what the emitters already say.
       A system that calls a package something else gets an entry; a system that
       has no equivalent at all gets `null`, and the emitters must then say so
       rather than installing something approximate.

       Gentoo atoms are category/name from packages.gentoo.org. The category is
       part of the name: `emerge vim` and `emerge app-editors/vim` are not
       reliably the same request, because more than one category can hold a
       package with that name. */
    var PKG_NAMES = {
        gentoo: {
            'linux-firmware': 'sys-kernel/linux-firmware',
            'sudo': 'app-admin/sudo',
            'vim': 'app-editors/vim',
            'man-db': 'sys-apps/man-db',
            'man-pages': 'sys-apps/man-pages',
            'texinfo': 'sys-apps/texinfo',
            'btrfs-progs': 'sys-fs/btrfs-progs',
            'xfsprogs': 'sys-fs/xfsprogs',
            'cryptsetup': 'sys-fs/cryptsetup',
            'lvm2': 'sys-fs/lvm2',
            'networkmanager': 'net-misc/networkmanager',
            'iwd': 'net-wireless/iwd',
            'grub': 'sys-boot/grub',
            'efibootmgr': 'sys-boot/efibootmgr',
            'zsh': 'app-shells/zsh',
            'fish': 'app-shells/fish',
            'intel-ucode': 'sys-firmware/intel-microcode',
            /* AMD microcode is not a separate package on Gentoo — it ships
               inside sys-kernel/linux-firmware, which the base install already
               pulls in. Mapping it to the firmware package rather than to a
               name that does not exist. */
            'amd-ucode': 'sys-kernel/linux-firmware',
            'cronie': 'sys-process/cronie',
            'opendoas': 'app-admin/doas',
            'ttf-jetbrains-mono': 'media-fonts/jetbrains-mono',
            /* There is no Nerd Fonts patched build in the main tree -
               media-fonts/nerdfonts does not exist, which this table claimed it
               did. media-fonts/jetbrains-mono is the plain font and is a
               different thing: the patch is what supplies the icon glyphs a
               Nerd Font is chosen for, so substituting it would leave a status
               bar full of empty boxes. Fetch the patched build from the Nerd
               Fonts release instead. */
            'ttf-jetbrains-mono-nerd': null,
            'base-devel': null,        // Gentoo's toolchain is in the stage3
            'terminus-font': 'media-fonts/terminus-font',
            'apparmor': 'sys-apps/apparmor',
            'usbguard': 'sys-apps/usbguard',
            'audit': 'sys-process/audit',
            'fail2ban': 'net-analyzer/fail2ban',
            'lynis': 'app-forensics/lynis',
            'unbound': 'net-dns/unbound',
            'dnscrypt-proxy': 'net-dns/dnscrypt-proxy',
            'bind': 'net-dns/bind',
            'dnsmasq': 'net-dns/dnsmasq',
            'stubby': 'net-dns/stubby',
            'sbsigntools': 'app-crypt/sbsigntools',
            'efitools': 'app-crypt/efitools',
            /* Distributed as a signed binary by its vendor rather than built
               from source, so there is no ebuild that could be honest here. */
            'shim-signed': null,
            'dbus': 'sys-apps/dbus',
            'os-prober': 'sys-boot/os-prober',
            'snapper': 'app-backup/snapper',
            'ufw': 'net-firewall/ufw',
            'nftables': 'net-firewall/nftables',
            'firefox': 'www-client/firefox',
            'chromium': 'www-client/chromium',
            'mpv': 'media-video/mpv',
            'thunar': 'xfce-base/thunar',
            'btop': 'sys-process/btop',
            'openssh': 'net-misc/openssh',
            'docker': 'app-containers/docker',
            'git': 'dev-vcs/git',

            /* The post-install application set. Every one of these is an atom
               from packages.gentoo.org rather than the bare name: `emerge vim`
               and `emerge app-editors/vim` are not reliably the same request. */
            'neovim': 'app-editors/neovim',
            'ripgrep': 'sys-apps/ripgrep',
            'fd': 'sys-apps/fd',
            'alacritty': 'x11-terms/alacritty',
            'kitty': 'x11-terms/kitty',
            'zsh-completions': 'app-shells/zsh-completions',
            'gvfs': 'gnome-base/gvfs',
            'thunar-volman': 'xfce-extra/thunar-volman',
            'obs-studio': 'media-video/obs-studio',
            'keepassxc': 'app-admin/keepassxc',
            'flatpak': 'sys-apps/flatpak',
            'tmux': 'app-misc/tmux',
            'htop': 'sys-process/htop',
            'nautilus': 'gnome-base/nautilus',
            'vlc': 'media-video/vlc',
            'gimp': 'media-gfx/gimp',
            'libreoffice-fresh': 'app-office/libreoffice',
            'bluez': 'net-wireless/bluez',
            /* One package here, where Arch splits the daemon from its tools. */
            'bluez-utils': null,
            'pipewire': 'media-video/pipewire',
            /* PulseAudio and ALSA compatibility are USE flags on the one
               package rather than separate packages, so naming them would
               emerge nothing. Turn on `sound-server`, `pulseaudio` and `alsa`
               on media-video/pipewire instead. */
            'pipewire-pulse': null,
            'pipewire-alsa': null,
            'wireplumber': 'media-video/wireplumber',
            'clamav': 'app-antivirus/clamav',
            'firejail': 'sys-apps/firejail',
            /* A pacman hook, so there is nothing to install. Snapper's own
               portage integration is a Portage hook script instead. */
            'snap-pac': null,
            'grub-btrfs': 'sys-fs/grub-btrfs',
            // No ebuild in the main tree.
            'pfetch': null,
            'fastfetch': 'app-misc/fastfetch',
            'usbutils': 'sys-apps/usbutils',
            'timeshift': 'app-backup/timeshift',
            /* Neither the launcher nor a browser package is in the main
               tree. The Tor Project's own download is the route here. */
            'tor-browser': null,
            'signal-desktop': 'net-im/signal-desktop-bin',

            /* Desktops and display servers. */
            'gnome': 'gnome-base/gnome',
            'gnome-tweaks': 'gnome-extra/gnome-tweaks',
            'gdm': 'gnome-base/gdm',
            'plasma-desktop': 'kde-plasma/plasma-meta',
            'sddm': 'x11-misc/sddm',
            'xorg-server': 'x11-base/xorg-server',
            'xorg-xinit': 'x11-apps/xinit',
            'xorg-xwayland': 'x11-base/xwayland',
            'wayland': 'dev-libs/wayland',
            'libx11': 'x11-libs/libX11',
            'libxinerama': 'x11-libs/libXinerama',
            'libxft': 'x11-libs/libXft',
            'hyprland': 'gui-wm/hyprland',
            'waybar': 'gui-apps/waybar',
            'rofi': 'x11-misc/rofi',

            /* Debian's unattended upgrades and the AUR's usbkill have no
               Gentoo counterpart; the equivalents are a Portage cron job and
               the USB guard tools already offered. */
            'unattended-upgrades': null,
            'usbkill': null,

            /* No equivalent. The emitters check for null and explain the
               absence instead of substituting something that merely sounds
               similar. */

            /* ── The ricing toolkit and the font choices ──────────────────
               Every one of these is emitted by desktopPackages(), and none of
               them was in this table, so each arrived at portage as a bare
               Arch name. `emerge wofi` is not a request portage can satisfy:
               without a category it stops and asks, and that is the good case.

               Atoms resolved against packages.gentoo.org. The four that are
               not in the main tree are null rather than pointed at something
               with a similar name - wmcliphist and xfce4-clipman-plugin are
               different programs from cliphist and clipman, and installing one
               because it sounds like the other is the substitution this file
               exists to refuse. The Hyprland companions live in an overlay. */
            'wofi': 'gui-apps/wofi',
            'polybar': 'x11-misc/polybar',
            'mako': 'gui-apps/mako',
            'dunst': 'x11-misc/dunst',
            'feh': 'media-gfx/feh',
            'picom': 'x11-misc/picom',
            'swaylock': 'gui-apps/swaylock',
            'swayidle': 'gui-apps/swayidle',
            'grim': 'gui-apps/grim',
            'slurp': 'gui-apps/slurp',
            'flameshot': 'media-gfx/flameshot',
            // Not in the main tree; the Hyprland ecosystem is carried in GURU.
            'hyprpaper': null,
            'hyprlock': null,
            'hypridle': null,
            // Not in the main tree, and the similarly named packages are
            // unrelated programs rather than alternative builds.
            'cliphist': null,
            'clipman': null,
            /* Plain Iosevka, which is what Arch's ttc-iosevka is. */
            'ttc-iosevka': 'media-fonts/iosevka',
            /* The Nerd Fonts patched builds are not packaged. The patch is the
               reason to choose one - it carries the icon glyphs - so the plain
               font is not a substitute for it. */
            'ttf-firacode-nerd': null,
            'ttf-cascadia-code-nerd': null,
            'ttf-hack-nerd': null,


            /* The six the AUR carries on Arch. Resolved against
               packages.gentoo.org rather than assumed: discord and vscodium
               are in the main tree, the other four are not. */
            'discord': 'net-im/discord',
            'vscodium': 'app-editors/vscodium',
            /* In overlays rather than the tree - see PKG_OVERLAY below, which
               names the overlay and how to enable it. A bare emerge for one of
               these fails with "no ebuilds to satisfy", which reads as the
               guide being wrong rather than the repository being absent. */
            'librewolf': null,
            'ungoogled-chromium': null,
            /* games-util/steam-launcher lives in the steam overlay, not the
               main tree. */
            'steam': null,
            /* An AUR helper. There is no AUR here for it to help with, and
               emerge is the equivalent it would be wrapping. */
            'paru': null,

            'base': null,              // the stage3 tarball is the base system
            'zram-generator': null     // Gentoo configures zram through its own init scripts
        },

        /* Raspberry Pi OS is Debian, so these are Debian binary package names.

           Every one was checked against the real indexes rather than
           remembered: the Bookworm arm64 Packages file from deb.debian.org and
           the Raspberry Pi archive's own from archive.raspberrypi.com, which is
           where raspi-config, rpi-eeprom and the hardware-accelerated browser
           builds come from. Raspberry Pi OS enables both, and the Pi archive is
           pinned above Debian, so a name present in both resolves to the Pi
           build. Three names that would have looked reasonable are not
           available and are null below with the reason.

           Debian splits and Arch merges, and the reverse, so several of these
           are not one-to-one. Where a name would install something merely
           similar, it is null and the guide says what to do instead. */
        raspios: {
            /* The image is the base system. There is no bootstrap to run and
               nothing to install: the kernel, the firmware and the boot files
               are written to the card with everything else. */
            'base': null,
            'linux-firmware': null,
            'sudo': 'sudo',
            'vim': 'vim',
            'man-db': 'man-db',
            'man-pages': 'manpages',
            'texinfo': 'texinfo',
            'btrfs-progs': 'btrfs-progs',
            'xfsprogs': 'xfsprogs',
            'cryptsetup': 'cryptsetup',
            'lvm2': 'lvm2',
            'networkmanager': 'network-manager',
            'iwd': 'iwd',
            /* The board boots from the bootloader in its EEPROM, which reads
               config.txt and cmdline.txt off the firmware partition. There is
               no UEFI, so no GRUB, no EFI boot manager and no Secure Boot
               chain to sign into. */
            'grub': null,
            'efibootmgr': null,
            'sbsigntools': null,
            'efitools': null,
            'shim-signed': null,
            'os-prober': null,
            'zsh': 'zsh',
            'fish': 'fish',
            // Microcode is an x86 concept. This is a Broadcom SoC.
            'intel-ucode': null,
            'amd-ucode': null,
            'cronie': 'cron',
            'opendoas': 'doas',
            'ttf-jetbrains-mono': 'fonts-jetbrains-mono',
            /* Debian packages the plain font and not the Nerd Fonts patched
               build, so there is no name here that would install the patched
               one. Fetching it from the Nerd Fonts release is the honest
               route and the guide says so. */
            'ttf-jetbrains-mono-nerd': null,
            'base-devel': 'build-essential',
            'terminus-font': 'xfonts-terminus',
            'apparmor': 'apparmor',
            'usbguard': 'usbguard',
            'audit': 'auditd',
            'fail2ban': 'fail2ban',
            'lynis': 'lynis',
            'unbound': 'unbound',
            /* Dropped from Debian before Bookworm and back in Trixie, so on
               Raspberry Pi OS 12 there is nothing to install under this name.
               Stubby and Unbound both do DNS-over-TLS here. */
            'dnscrypt-proxy': null,
            'bind': 'bind9',
            'dnsmasq': 'dnsmasq',
            'stubby': 'stubby',
            'dbus': 'dbus',
            'snapper': 'snapper',
            'ufw': 'ufw',
            'nftables': 'nftables',
            /* The Raspberry Pi archive builds both of these against the board's
               video hardware. Debian's equivalents are firefox-esr and its own
               chromium, and taking those instead gives up the acceleration. */
            'firefox': 'firefox',
            'chromium': 'chromium',
            'mpv': 'mpv',
            'thunar': 'thunar',
            'btop': 'btop',
            'openssh': 'openssh-server',
            'docker': 'docker.io',
            'git': 'git',
            'neovim': 'neovim',
            'ripgrep': 'ripgrep',
            // Debian ships the binary as fdfind, to avoid a name collision.
            'fd': 'fd-find',
            'alacritty': 'alacritty',
            'kitty': 'kitty',
            'zsh-completions': 'zsh-syntax-highlighting',
            'gvfs': 'gvfs',
            'thunar-volman': 'thunar-volman',
            'obs-studio': 'obs-studio',
            'keepassxc': 'keepassxc',
            'flatpak': 'flatpak',
            'tmux': 'tmux',
            'htop': 'htop',
            'nautilus': 'nautilus',
            'vlc': 'vlc',
            'gimp': 'gimp',
            'libreoffice-fresh': 'libreoffice',
            'bluez': 'bluez',
            'bluez-utils': 'bluez-tools',
            'pipewire': 'pipewire',
            'pipewire-pulse': 'pipewire-pulse',
            'pipewire-alsa': 'pipewire-alsa',
            'wireplumber': 'wireplumber',
            'clamav': 'clamav',
            'firejail': 'firejail',
            // A pacman hook. Debian's equivalent is an apt hook you write.
            'snap-pac': null,
            'grub-btrfs': null,
            'pfetch': null,
            'fastfetch': null,
            'usbutils': 'usbutils',
            'timeshift': 'timeshift',
            /* Not built for arm64 anywhere in Debian - the launcher is
               published for amd64 and i386 only, because the Tor Browser
               bundle it downloads is not released for this architecture. */
            'tor-browser': null,
            'signal-desktop': null,

            /* Desktops and display servers. */
            'gnome': 'gnome',
            'gnome-tweaks': 'gnome-tweaks',
            'gdm': 'gdm3',
            'plasma-desktop': 'kde-plasma-desktop',
            'sddm': 'sddm',
            'xorg-server': 'xserver-xorg',
            'xorg-xinit': 'xinit',
            'xorg-xwayland': 'xwayland',
            'wayland': 'libwayland-client0',
            'libx11': 'libx11-6',
            'libxinerama': 'libxinerama1',
            'libxft': 'libxft2',
            /* Hyprland reached Debian in unstable and is in neither Bookworm
               nor Trixie, so Raspberry Pi OS 12 cannot install it from apt.
               This is why Dusky is not offered here. */
            'hyprland': null,
            'waybar': 'waybar',
            'rofi': 'rofi',
            'wofi': 'wofi',
            'mako': 'mako-notifier',
            'dunst': 'dunst',
            'picom': 'picom',
            'feh': 'feh',
            'grim': 'grim',
            'slurp': 'slurp',
            'flameshot': 'flameshot',

            'unattended-upgrades': 'unattended-upgrades',
            // Debian's own zram helper, rather than the systemd generator.
            'zram-generator': 'zram-tools',

            /* The ricing toolkit and the font choices, checked against the
               Bookworm arm64 index the same way the rest of this table was.
               Debian renames mako to mako-notifier; the Hyprland companions
               and cliphist are not packaged at all, and clipman in Debian is
               an Xfce panel plugin rather than the program of that name. */
            'wofi': 'wofi',
            'polybar': 'polybar',
            'mako': 'mako-notifier',
            'dunst': 'dunst',
            'feh': 'feh',
            'picom': 'picom',
            'swaylock': 'swaylock',
            'swayidle': 'swayidle',
            'grim': 'grim',
            'slurp': 'slurp',
            'flameshot': 'flameshot',
            /* Not in the Debian archive for this architecture. The three
               Hyprland companions follow Hyprland itself, which is in unstable
               only; cliphist is unpackaged, and Debian's clipman is an Xfce
               panel plugin rather than the program of that name, so neither
               gets pointed at something that merely shares a spelling. */
            'hyprpaper': null,
            'hyprlock': null,
            'hypridle': null,
            'cliphist': null,
            'clipman': null,
            /* Neither Iosevka nor the Nerd Fonts patched builds are in the
               Debian archive for this architecture. Only the plain JetBrains
               Mono is, and it is mapped above. */
            'ttc-iosevka': null,
            'ttf-firacode-nerd': null,
            'ttf-cascadia-code-nerd': null,
            'ttf-hack-nerd': null,


            /* The six the AUR carries on Arch, checked against the Bookworm
               arm64 index. LibreWolf, VSCodium and ungoogled-chromium each
               publish their own apt repository rather than appearing in
               Debian, and adding a third-party repository hands its owner the
               ability to replace any package at the next upgrade - so the
               guide names them rather than quietly adding the source. */
            'librewolf': null,
            'vscodium': null,
            'ungoogled-chromium': null,
            'discord': null,
            /* Debian's steam package is architecture `all` wrapping an i386
               client. There is nothing in it that runs on aarch64. */
            'steam': null,
            // An AUR helper, on a system with no AUR.
            'paru': null,

            /* No Debian package. usbkill is a script from its own repository,
               and anti-ducky covers the same ground here. */
            'usbkill': null
        }
    };

    /* ── Packages that exist, but not in the main tree ──────────────────────
       An ebuild in an overlay is not the same offer as one in the tree: it has
       to be enabled first, and it is maintained by someone else. Emitting a
       bare `emerge` for one of these would fail with "no ebuilds to satisfy",
       which reads as the guide being wrong rather than the repository being
       absent — so the guide names the overlay and how to add it instead.

       `eselect repository` comes from app-eselect/eselect-repository. */
    var PKG_OVERLAY = {
        gentoo: {
            'librewolf': { repo: 'librewolf', atom: 'www-client/librewolf',
                           note: "the LibreWolf project's own overlay" },
            'ungoogled-chromium': { repo: 'guru', atom: 'www-client/ungoogled-chromium',
                                    note: 'GURU, the user-contributed repository' }
        }
    };

    /** Where a package lives when it is not in the main tree, or null. */
    function pkgOverlay(os, name) {
        var table = PKG_OVERLAY[os];
        return (table && table[name]) || null;
    }

    /** Translate one Arch package name for the target system. */
    function pkgName(os, name) {
        var table = PKG_NAMES[os];
        if (!table) return name;                       // same names as Arch
        return Object.prototype.hasOwnProperty.call(table, name) ? table[name] : name;
    }

    /** Translate a list, dropping the ones that do not exist on that system. */
    function pkgNames(os, list) {
        var out = [];
        (list || []).forEach(function (n) {
            var mapped = pkgName(os, n);
            if (mapped) out.push(mapped);
        });
        return out;
    }

    /** What was dropped, so a guide can say why rather than going quiet. */
    function pkgUnavailable(os, list) {
        var out = [];
        (list || []).forEach(function (n) {
            if (pkgName(os, n) === null) out.push(n);
        });
        return out;
    }


    /* ── Init systems ───────────────────────────────────────────────────────
       Gentoo's init is a genuine choice rather than a fact about the system, so
       the service commands are looked up by init rather than by OS. Passing an
       init a system does not offer is a programming error and throws. */
    var INIT = {
        systemd: {
            label: 'systemd',
            enable: function (unit) { return 'systemctl enable ' + unit; },
            enableNow: function (unit) { return 'systemctl enable --now ' + unit; },
            /* systemd unit names carry a suffix; OpenRC script names do not.
               The emitters pass the bare name and this adds what is needed. */
            unit: function (name) { return name + '.service'; }
        },
        openrc: {
            label: 'OpenRC',
            enable: function (unit) { return 'rc-update add ' + unit + ' default'; },
            enableNow: function (unit) {
                return 'rc-update add ' + unit + ' default && rc-service ' + unit + ' start';
            },
            unit: function (name) { return name; }
        }
    };

    function initOf(os, answers) {
        var model = OS_INSTALL[os];
        if (!model) return INIT.systemd;
        if (model.init.fixed) return INIT[model.init.fixed];
        var chosen = answers && answers.init_system;
        return INIT[chosen] || INIT[model.init.dflt];
    }


    /* ── The install models ─────────────────────────────────────────────── */

    var OS_INSTALL = {

        arch: {
            family: 'arch',
            authority: 'https://wiki.archlinux.org/title/Installation_guide',
            /* Arch mounts the EFI system partition at /boot and puts the kernel
               there directly. Gentoo mounts it at /efi and keeps /boot on the
               root filesystem — the same partition, a different place, and
               getting it wrong produces a system that builds and will not
               boot. */
            espMount: '/boot',
            /* Where downloaded packages live, relative to the root. Given a
               Btrfs subvolume of its own so snapshots do not carry the package
               cache around with them. */
            pkgCache: 'var/cache/pacman/pkg',
            init: { fixed: 'systemd' },
            kernel: { model: 'binary', compiled: false },
            aur: true,

            sync: 'pacman -Sy',
            install: function (pkgs) {
                return 'pacman -S --needed --noconfirm ' + pkgs.join(' ');
            },
            /* The same request without "skip what is already there". Both forms
               are in the emitters and the difference is not decorative: the
               plain form reinstalls, which is what you want when a package has
               to be rebuilt against something that changed under it. On Gentoo
               the same distinction is `--noreplace` or not. */
            installPlain: function (pkgs) {
                return 'pacman -S --noconfirm ' + pkgs.join(' ');
            },
            upgrade: 'pacman -Syu --noconfirm',
            /* Remove without walking the dependency graph. Used in exactly one
               place — replacing sudo with a doas wrapper, where the point is
               that everything depending on sudo keeps working through the
               wrapper. It is a sharp tool and the emitters treat it as one. */
            removeNoDeps: function (pkgs) {
                return 'pacman -Rdd --noconfirm ' + pkgs.join(' ');
            },
            chroot: 'arch-chroot /mnt',
            fstab: 'genfstab -U /mnt >> /mnt/etc/fstab',
            initramfs: 'mkinitcpio -P',

            /* How to ask whether a package the reader typed exists, and what to
               tell them when it does not. Held here because all three systems
               answer it differently and the emitters used to branch: the
               default arm handed pacman's syntax to whatever was not Gentoo. */
            queryPkg: {
                exists: 'pacman -Si "$pkg"',
                absent: 'is in neither the official repos nor the AUR.',
                hints: [
                    'Official: https://archlinux.org/packages/?q=$pkg',
                    'AUR:      https://aur.archlinux.org/packages?K=$pkg',
                    'It may have been renamed or dropped. Skipping this one.'
                ]
            }
        },

        gentoo: {
            family: 'gentoo',
            authority: 'https://wiki.gentoo.org/wiki/Handbook:AMD64',
            espMount: '/efi',
            /* Binary packages fetched with --getbinpkg land here. Portage's
               source tree and distfiles are elsewhere again, but this is the one
               that grows without bound and so wants its own subvolume. */
            pkgCache: 'var/cache/binpkgs',
            /* Both are supported and the choice changes every service command
               below, which is why it gates other questions the way the desktop
               choice does. OpenRC is Gentoo's own and the default profile. */
            init: { dflt: 'openrc', choices: ['openrc', 'systemd'] },
            /* The reason someone runs Gentoo. Every package can be compiled for
               the machine it will run on, and the kernel is not shipped
               pre-built by default. */
            kernel: { model: 'source', compiled: true },
            aur: false,

            sync: 'emerge --sync',
            install: function (pkgs) {
                return 'emerge --verbose --noreplace ' + pkgs.join(' ');
            },
            installPlain: function (pkgs) {
                return 'emerge --verbose ' + pkgs.join(' ');
            },
            upgrade: 'emerge --verbose --update --deep --changed-use @world',
            /* Portage's equivalent. `--unmerge` removes the package without
               consulting what depends on it, which is the same sharp edge
               pacman's `-Rdd` has and the same reason it is used here. */
            removeNoDeps: function (pkgs) {
                return 'emerge --unmerge --quiet ' + pkgs.join(' ');
            },
            /* Gentoo has no arch-chroot wrapper: the bind mounts are done by
               hand first, then a plain chroot. Listed rather than folded into
               one string because each line is a separate failure point and the
               guide explains them individually. */
            chrootPrep: [
                'mount --types proc /proc /mnt/gentoo/proc',
                'mount --rbind /sys /mnt/gentoo/sys',
                'mount --make-rslave /mnt/gentoo/sys',
                'mount --rbind /dev /mnt/gentoo/dev',
                'mount --make-rslave /mnt/gentoo/dev',
                'mount --bind /run /mnt/gentoo/run',
                'mount --make-slave /mnt/gentoo/run'
            ],
            /* An unqualified name that matches more than one category makes
               portage stop and ask rather than guess, which is a good reason to
               check before installing rather than after. */
            queryPkg: {
                exists: 'emerge --pretend --quiet "$pkg"',
                absent: 'did not resolve to a package.',
                hints: [
                    'Search: https://packages.gentoo.org/packages/search?q=$pkg',
                    'A name without its category can match more than one',
                    'package. Try the full atom, e.g. app-editors/vim.'
                ]
            },
            chroot: 'chroot /mnt/gentoo /bin/bash',
            chrootAfter: [
                'source /etc/profile',
                'export PS1="(chroot) ${PS1}"'
            ],
            /* No genfstab on Gentoo. fstab is written by hand, which is a real
               step the guide has to walk through rather than a command to
               print. */
            fstab: null,
            initramfs: null,

            /* Where the base system comes from. Not a package manager
               operation at all — a signed tarball, verified and unpacked. */
            stage3: {
                mirrorList: 'https://www.gentoo.org/downloads/mirrors/',
                path: 'releases/amd64/autobuilds/current-stage3-amd64-openrc/',
                keyImport: 'gpg --import /usr/share/openpgp-keys/gentoo-release.asc',
                verify: function (file) { return 'gpg --verify ' + file + '.asc ' + file; },
                unpack: function (file) {
                    return 'tar xpvf ' + file + " --xattrs-include='*.*' " +
                           '--numeric-owner -C /mnt/gentoo';
                },
                /* The stage3 answer names an autobuilds directory, and it also
                   settles the init system and the libc — which is why there is
                   no separate profile question. Picking `systemd` here and an
                   OpenRC profile later is the most common way a first Gentoo
                   install goes wrong, so one answer decides both and the
                   profile step below is told which number to look for. */
                dirs: {
                    'openrc': 'current-stage3-amd64-openrc',
                    'systemd': 'current-stage3-amd64-systemd',
                    'hardened-openrc': 'current-stage3-amd64-hardened-openrc',
                    'musl': 'current-stage3-amd64-musl'
                },
                dirFor: function (variant) {
                    return this.dirs[variant] || this.dirs.openrc;
                },
                /* Which init the tarball carries, so a caller does not have to
                   parse the variant name to find out. */
                initFor: function (variant) {
                    return variant === 'systemd' ? 'systemd' : 'openrc';
                }
            },

            /* ── The answers that become make.conf ──────────────────────────
               Held here rather than in either front end because both emit them
               and they must not drift. A build job wants roughly 2 GB of RAM
               when it links, so the job count is a memory decision as much as a
               speed one. */
            makeopts: {
                nproc: '-j$(nproc)',
                half: '-j$(( $(nproc) / 2 ))',
                '1': '-j1'
            },
            useSets: {
                profile: '',
                desktop: 'USE="elogind dbus policykit -systemd"',
                minimal: 'USE="-X -wayland -bluetooth -pulseaudio -gtk -qt5"'
            },

            /* The three kernel routes, in the order of how much work they are.
               `manual` is the reason people run Gentoo and also the way a first
               install fails to boot; `bin` is a pre-built binary kernel and is
               the honest recommendation for a first attempt. */
            kernelPkgs: {
                manual: ['sys-kernel/gentoo-sources', 'sys-apps/pciutils'],
                dist: ['sys-kernel/gentoo-kernel'],
                bin: ['sys-kernel/gentoo-kernel-bin']
            },

            /* Gentoo has no mkinitcpio. Dracut arrives through installkernel's
               USE flag and rebuilds itself whenever a kernel is installed,
               which is why `initramfs` above is null rather than a command:
               there is nothing to run by hand in the ordinary case. */
            dracut: {
                enable: [
                    'echo "sys-kernel/installkernel dracut" >> /etc/portage/package.use/installkernel',
                    'emerge --verbose --noreplace sys-kernel/installkernel'
                ],
                cryptModules: 'add_dracutmodules+=" crypt dm rootfs-block "'
            }
        },

        raspios: {
            family: 'debian',
            authority: 'https://www.raspberrypi.com/documentation/',

            /* ── Nothing is installed. An image is written to a card ─────────
               This is the difference that shapes everything else. Arch and
               Gentoo both bootstrap a system onto a filesystem you prepared;
               Raspberry Pi OS ships that filesystem already made. There is no
               live environment, no partitioning, no chroot and no base
               package set — the card is imaged, the board is booted, and the
               first thing that runs is the installed system.

               `imaged` is what the emitters branch on. It is a statement about
               the shape of the install rather than about the package manager,
               because a second Debian on ordinary hardware would share every
               apt command below and none of this. */
            imaged: {
                tool: 'Raspberry Pi Imager',
                toolUrl: 'https://www.raspberrypi.com/software/',
                imagesUrl: 'https://www.raspberrypi.com/software/operating-systems/',
                /* The Imager writes these before first boot. They are the
                   supported way to configure a headless Pi, and they are why
                   this guide has no chroot section: the work a chroot does
                   elsewhere is done here, by files on the boot partition. */
                firstBoot: {
                    userconf: 'userconf.txt',
                    ssh: 'ssh',
                    wifi: 'wpa_supplicant.conf'
                },
                expand: 'raspi-config --expand-rootfs',
                configure: 'raspi-config'
            },

            /* The FAT partition, and it is NOT an EFI system partition. The
               board's own bootloader reads config.txt and cmdline.txt from it.
               Named `espMount` to match the field the emitters already read,
               with the distinction spelled out wherever it is printed. */
            espMount: '/boot/firmware',
            pkgCache: 'var/cache/apt/archives',
            init: { fixed: 'systemd' },
            kernel: { model: 'binary', compiled: false },
            aur: false,

            sync: 'apt-get update',
            /* --no-install-recommends is the default here for the same reason
               --needed is on the Arch side: it installs what was asked for.
               Debian's recommends pull in a desktop's worth of extras on a
               board with 512 MB of RAM and an SD card. */
            install: function (pkgs) {
                return 'apt-get install -y --no-install-recommends ' + pkgs.join(' ');
            },
            installPlain: function (pkgs) {
                return 'apt-get install -y ' + pkgs.join(' ');
            },
            upgrade: 'apt-get update && apt-get full-upgrade -y',
            /* dpkg rather than apt, because apt refuses to break a dependency
               and this is the one place that is the intent — the doas wrapper
               keeps everything that depended on sudo working. */
            removeNoDeps: function (pkgs) {
                return 'dpkg --remove --force-depends ' + pkgs.join(' ');
            },
            /* No chroot in the ordinary flow: the first shell you get is on
               the booted board. Customising the image offline needs
               qemu-user-static and is a different job from installing. */
            chroot: null,
            /* apt-cache reads the lists already on disk, so this asks the same
               question offline that the others ask of their own databases. */
            queryPkg: {
                exists: 'apt-cache show "$pkg" 2>/dev/null | grep -q .',
                absent: 'is in neither the Debian nor the Raspberry Pi archive.',
                hints: [
                    'Debian:       https://packages.debian.org/search?keywords=$pkg',
                    'Raspberry Pi: https://archive.raspberrypi.com/debian/',
                    'Run apt-get update first if the lists are stale.'
                ]
            },
            // The image ships its own, with the PARTUUIDs already correct.
            fstab: null,
            initramfs: 'update-initramfs -u -k all',

            /* ── Boot, which is not UEFI and must never be called measured ───
               The Pi 4 and 5 hold their bootloader in EEPROM and can verify a
               signed boot image before running it. That is verified boot, and
               it is real. It is not measured boot: nothing extends a PCR
               because the board has no TPM, so there is nothing for a remote
               party to attest and nothing for a key to be sealed against.
               Calling it measured would promise a property the hardware does
               not have, which on a page about anti-evil-maid attacks is the
               worst place to be loose with a word. */
            eeprom: {
                update: 'rpi-eeprom-update -a',
                version: 'vcgencmd bootloader_version',
                config: 'rpi-eeprom-config',
                bootFiles: ['config.txt', 'cmdline.txt'],
                verifiedBoot: true,
                measuredBoot: false
            },

            /* Full-disk encryption is not what this system does. The image
               boots unencrypted, and there is no installer option for it. It
               can be done — initramfs, cryptsetup, and moving the root — but
               it is a rebuild rather than a setting, so the guide describes it
               as the separate job it is instead of implying the Arch steps
               transfer. */
            fde: { standard: false, mechanism: 'cryptsetup + initramfs-tools' }
        }
    };

    /**
     * The install model for a system, or a thrown error naming what is missing.
     *
     * Loud on purpose. A silent fallback to Arch here would print pacstrap and
     * pacman under another system's heading, which is the single defect class
     * this project has spent the most time removing.
     */
    function installModel(os) {
        var model = OS_INSTALL[os];
        if (!model) {
            throw new Error('os-install.js: no install model for "' + os +
                            '". Its emitters have not been written, so there is ' +
                            'nothing honest to generate for it.');
        }
        return model;
    }

    /** True when a system has an install model, for callers that must not throw. */
    function hasInstallModel(os) {
        return Object.prototype.hasOwnProperty.call(OS_INSTALL, os);
    }

    /* ── Which security tools work on which system ──────────────────────────
       Mirrors `SUPPORT_*` and `support_reason()` in
       scripts/install-security-suite.sh. Two copies is one more than ideal, but
       the installer runs on a machine with no website and the website runs with
       no installer, so neither can read the other. What must not happen is the
       two disagreeing, so the strings are kept identical and
       `tests/tool-support.mjs` compares them.

       'yes' | 'partial' | 'no'. `partial` means some of the tool works and some
       cannot — the reason says which half, because "partial" on its own tells a
       reader nothing about whether the part they need is the part that works. */
    var TOOL_SUPPORT = {
        arch:    { 'libre-otp': 'yes', 'anti-ducky': 'yes', 'anti-evil-maid': 'yes',
                   'kernel-watcher': 'yes', 'scarecrow': 'yes', 'aur-guard': 'yes',
                   'pi-boot-guard': 'no' },
        gentoo:  { 'libre-otp': 'yes', 'anti-ducky': 'yes', 'anti-evil-maid': 'yes',
                   'kernel-watcher': 'yes', 'scarecrow': 'yes', 'aur-guard': 'no',
                   'pi-boot-guard': 'no' },
        raspios: { 'libre-otp': 'yes', 'anti-ducky': 'partial', 'anti-evil-maid': 'partial',
                   'kernel-watcher': 'yes', 'scarecrow': 'yes', 'aur-guard': 'no',
                   'pi-boot-guard': 'yes' },
        freebsd: { 'libre-otp': 'yes', 'anti-ducky': 'no', 'anti-evil-maid': 'partial',
                   'kernel-watcher': 'yes', 'scarecrow': 'partial', 'aur-guard': 'no',
                   'pi-boot-guard': 'no' },
        openbsd: { 'libre-otp': 'no', 'anti-ducky': 'no', 'anti-evil-maid': 'partial',
                   'kernel-watcher': 'yes', 'scarecrow': 'no', 'aur-guard': 'no',
                   'pi-boot-guard': 'no' }
    };

    /* Why, in the tool's own terms. A shorter list than the table above because
       most 'no' answers share a reason, and because a system that simply is not
       the target hardware needs no explanation beyond that. */
    var TOOL_REASON = {
        'openbsd:libre-otp': 'OpenBSD has no PAM; it uses BSD auth, which is a different integration',
        'openbsd:scarecrow': 'the duress gate needs PAM, and header erase needs cryptsetup',
        'freebsd:anti-ducky': 'built on Linux evdev and the USB authorized sysfs node',
        'openbsd:anti-ducky': 'built on Linux evdev and the USB authorized sysfs node',
        'raspios:anti-ducky': 'timing detection works; USB deauthorization on the Pi is unverified',
        'openbsd:anti-evil-maid': 'boot hashing works; softraid has no suspend, so the lock-on-tamper half cannot',
        'freebsd:anti-evil-maid': 'boot hashing works; suspend uses geli rather than cryptsetup and is untested',
        'raspios:anti-evil-maid': 'boot hashing works; the Pi boots from EEPROM, so the EFI checks do not apply',
        'freebsd:scarecrow': 'canaries work; header erase uses geli rather than cryptsetup and is untested',
        'gentoo:aur-guard': 'there is no AUR on Gentoo; the equivalent would audit an ebuild',
        'freebsd:aur-guard': 'there is no AUR here; the equivalent would audit a ports Makefile',
        'openbsd:aur-guard': 'there is no AUR here; the equivalent would audit a ports Makefile',
        'raspios:aur-guard': 'there is no AUR on Debian; packages come from apt',
        'arch:pi-boot-guard': 'Raspberry Pi hardware only',
        'gentoo:pi-boot-guard': 'Raspberry Pi hardware only',
        'freebsd:pi-boot-guard': 'Raspberry Pi hardware only',
        'openbsd:pi-boot-guard': 'Raspberry Pi hardware only'
    };

    /** 'yes' | 'partial' | 'no' for a tool on a system. Unknown pairs read 'no'. */
    function toolSupport(os, tool) {
        var table = TOOL_SUPPORT[osIdOfSafe(os)];
        return (table && table[tool]) || 'no';
    }

    /** Why it is not a plain yes, or '' when it is. */
    function toolReason(os, tool) {
        return TOOL_REASON[osIdOfSafe(os) + ':' + tool] || '';
    }

    /* os-meta.js owns the fallback, but this file is loaded beside it rather
       than after it in every harness, so the lookup is guarded rather than
       assuming the helper is there. */
    function osIdOfSafe(os) {
        if (typeof root.osIdOf === 'function') return root.osIdOf(os);
        return Object.prototype.hasOwnProperty.call(TOOL_SUPPORT, os) ? os : 'arch';
    }

    /* -- The post-install application catalogue ----------------------------
       One list of what a reader can install after the first boot, and what
       each of those means in packages.

       It exists because the two front ends had drifted badly: the generator
       offered 34 applications and the walkthrough 13, four of which the
       generator did not have at all. The same tick meant different packages on
       the two sides, and nothing noticed, because each front end kept its own
       idea of what "the apps" were.

       `pkgs` is the Arch package list. It is a list rather than a string so
       every name can be translated for the target system through PKG_NAMES -
       one tick can be several packages, and Debian and Gentoo split and merge
       them differently from Arch.

       `aur: true` marks the ones Arch does not carry itself. A system with no
       AUR gets those looked up in its own repositories, or named as
       unavailable there; it never gets a paru command it cannot run.

       `cat` groups them the way the generator's grid already did, so the
       walkthrough can present the same shape without forming a second opinion
       about what belongs together. */
    var APPS = [
        { id: 'rofi',                label: 'Rofi',                icon: '🔍',   blurb: 'Launcher',      cat: 'core',      pkgs: ['rofi'], desc: 'Application launcher. On Wayland the equivalent is wofi.' },
        { id: 'paru',                label: 'paru',                icon: '🦀',   blurb: 'AUR Helper',    cat: 'core',      pkgs: ['paru'], desc: 'AUR helper. Builds PKGBUILDs a stranger wrote, as your user.', aur: true },
        { id: 'firefox',             label: 'Firefox',             icon: '🦊',   blurb: 'Browser',       cat: 'browser',   pkgs: ['firefox'] },
        { id: 'librewolf',           label: 'LibreWolf',           icon: '🐺',   blurb: 'Privacy',       cat: 'browser',   pkgs: ['librewolf'], desc: 'Firefox with telemetry removed and defaults hardened.', aur: true },
        { id: 'tor-browser',         label: 'Tor Browser',         icon: '🧅',   blurb: 'Anon',          cat: 'browser',   pkgs: ['tor-browser'], desc: 'Anonymity through Tor. Do not add extensions to it.', aur: true },
        { id: 'chromium',            label: 'Chromium',            icon: '🔵',   blurb: 'Browser',       cat: 'browser',   pkgs: ['chromium'] },
        { id: 'ungoogled-chromium',  label: 'Ungoogled Chromium',  icon: '🌐',   blurb: 'Browser',       cat: 'browser',   pkgs: ['ungoogled-chromium'], desc: 'Chromium with Google integration stripped out.', aur: true },
        { id: 'signal',              label: 'Signal',              icon: '💬',   blurb: 'E2E Msg',       cat: 'security',  pkgs: ['signal-desktop'], desc: 'Proprietary server, open client. Excluded under a libre policy.', aur: true },
        { id: 'keepassxc',           label: 'KeePassXC',           icon: '🔑',   blurb: 'Passwords',     cat: 'security',  pkgs: ['keepassxc'], desc: 'Offline password database. No sync, no account.' },
        { id: 'clamav',              label: 'ClamAV',              icon: '🛡️',  blurb: 'Antivirus',     cat: 'security',  pkgs: ['clamav'], desc: 'Signature scanner. Catches Windows malware on shared storage.' },
        { id: 'firejail',            label: 'Firejail',            icon: '🏰',   blurb: 'Sandbox',       cat: 'security',  pkgs: ['firejail'], desc: 'Sandboxes an application. Its own profiles can weaken it if edited carelessly.' },
        { id: 'doas',                label: 'doas',              icon: '⚙️',  blurb: 'Privilege',     cat: 'security',  pkgs: ['opendoas'], desc: 'Smaller sudo. Replaces it through a wrapper so nothing else breaks.' },
        { id: 'neovim',              label: 'Neovim',              icon: '📝',   blurb: 'Editor',        cat: 'dev',       pkgs: ['neovim', 'git', 'ripgrep', 'fd'], desc: 'Editor. Themed to match your palette.' },
        { id: 'alacritty',           label: 'Alacritty',           icon: '⬛',   blurb: 'Terminal',      cat: 'dev',       pkgs: ['alacritty'], desc: 'GPU terminal, minimal.' },
        { id: 'kitty',               label: 'kitty',               icon: '🐱',   blurb: 'Terminal',      cat: 'dev',       pkgs: ['kitty'], desc: 'GPU terminal. Themed to match your palette.' },
        { id: 'zsh',                 label: 'Zsh',                 icon: '🐚',   blurb: 'Shell',         cat: 'dev',       pkgs: ['zsh', 'zsh-completions'] },
        { id: 'vscodium',            label: 'VSCodium',            icon: '📘',   blurb: 'IDE',           cat: 'dev',       pkgs: ['vscodium'], desc: 'VS Code with Microsoft telemetry and branding removed.', aur: true },
        { id: 'git',                 label: 'Git',                 icon: '🔀',   blurb: 'VCS',           cat: 'dev',       pkgs: ['git'], desc: 'Asks for your name and email.' },
        { id: 'tmux',                label: 'tmux',                icon: '🪟',   blurb: 'Multiplex',     cat: 'dev',       pkgs: ['tmux'] },
        { id: 'htop',                label: 'htop',                icon: '📊',   blurb: 'Monitor',       cat: 'dev',       pkgs: ['htop'] },
        { id: 'pfetch',              label: 'pfetch',              icon: '🖥️',  blurb: 'Sysinfo',       cat: 'dev',       pkgs: ['pfetch'], desc: 'Sysinfo in POSIX shell. Instant, tiny, reports less than fastfetch.' },
        { id: 'fastfetch',           label: 'fastfetch',           icon: '⚡',   blurb: 'Sysinfo',       cat: 'dev',       pkgs: ['fastfetch'], desc: 'Sysinfo in C. Reports more than pfetch and is larger.' },
        { id: 'thunar',              label: 'Thunar',              icon: '📁',   blurb: 'Files',         cat: 'media',     pkgs: ['thunar', 'gvfs', 'thunar-volman'], desc: 'File manager. Lighter than Nautilus and pulls in no desktop.' },
        { id: 'nautilus',            label: 'Nautilus',            icon: '📂',   blurb: 'Files',         cat: 'media',     pkgs: ['nautilus'], desc: 'GNOME Files. Brings GNOME libraries whether or not you run GNOME.' },
        { id: 'mpv',                 label: 'mpv',                 icon: '▶️',  blurb: 'Player',        cat: 'media',     pkgs: ['mpv'] },
        { id: 'vlc',                 label: 'VLC',                 icon: '🔶',   blurb: 'Player',        cat: 'media',     pkgs: ['vlc'] },
        { id: 'obs',                 label: 'OBS Studio',          icon: '🎥',   blurb: 'Record',        cat: 'media',     pkgs: ['obs-studio'] },
        { id: 'gimp',                label: 'GIMP',                icon: '🎨',   blurb: 'Images',        cat: 'media',     pkgs: ['gimp'] },
        { id: 'libreoffice',         label: 'LibreOffice',         icon: '📄',   blurb: 'Office',        cat: 'media',     pkgs: ['libreoffice-fresh'] },
        { id: 'flatpak',             label: 'Flatpak',             icon: '📦',   blurb: 'Apps',          cat: 'system',    pkgs: ['flatpak'], desc: 'Sandboxed application store, separate from pacman.' },
        { id: 'networkmanager',      label: 'NetworkManager',      icon: '📡',   blurb: 'Network',       cat: 'system',    pkgs: ['networkmanager'], desc: 'Network management. Chosen already if you picked it above.' },
        { id: 'bluetooth',           label: 'Bluetooth',           icon: '🔵',   blurb: 'bluez',         cat: 'system',    pkgs: ['bluez', 'bluez-utils'], desc: 'bluez plus its tools. Off until you enable the service.' },
        { id: 'pipewire',            label: 'PipeWire',            icon: '🔊',   blurb: 'Audio',         cat: 'system',    pkgs: ['pipewire', 'pipewire-pulse', 'pipewire-alsa', 'wireplumber'], desc: 'Audio server, with PulseAudio and ALSA compatibility.' },
        { id: 'openssh',             label: 'OpenSSH',             icon: '🔐',   blurb: 'SSH Server',    cat: 'system',    pkgs: ['openssh'], desc: 'Asks whether to permit root login and password auth.' },
        { id: 'btop',                label: 'btop',                icon: '📊',   blurb: 'Monitor',       cat: 'dev',       pkgs: ['btop'] },
        { id: 'docker',              label: 'Docker',              icon: '🐳',   blurb: 'Containers',    cat: 'system',    pkgs: ['docker'], desc: 'Asks whether to add you to the docker group, which is root-equivalent.' },
        { id: 'steam',               label: 'Steam',               icon: '🎮',   blurb: 'Games',         cat: 'media',     pkgs: ['steam'], desc: 'Proprietary. Excluded under a libre policy.' },
        { id: 'discord',             label: 'Discord',             icon: '💬',   blurb: 'Chat',          cat: 'media',     pkgs: ['discord'], desc: 'Proprietary. Excluded under a libre policy.' },
    ];

    /** Every application id, in catalogue order. */
    function appIds() { return APPS.map(function (a) { return a.id; }); }

    /** One catalogue entry, or null. */
    function appById(id) {
        for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i];
        return null;
    }

    /**
     * Arch package names for a set of application ids, de-duplicated.
     * Order follows the catalogue rather than the order they were ticked, so
     * the same selection always produces the same command.
     */
    function appPkgs(ids) {
        var want = ids || [];
        var out = [];
        APPS.forEach(function (a) {
            if (want.indexOf(a.id) === -1) return;
            a.pkgs.forEach(function (pkg) { if (out.indexOf(pkg) === -1) out.push(pkg); });
        });
        return out;
    }

    /** Of those ids, the ones that only exist in the AUR. */
    function appAurIds(ids) {
        var want = ids || [];
        return APPS.filter(function (a) {
            return a.aur && want.indexOf(a.id) !== -1;
        }).map(function (a) { return a.id; });
    }

    root.APPS = APPS;
    root.appIds = appIds;
    root.appById = appById;
    root.appPkgs = appPkgs;
    root.appAurIds = appAurIds;

    /* ── Applications that do the same job as each other ────────────────────
       Picking two of these is a legitimate choice and is never blocked. It is
       also, far more often, someone ticking boxes down a list without noticing
       that two of them overlap — and finding out later, when both greet them
       at every shell or when the wrong one opens a folder.

       So the reader is told, at the point of choosing, with the actual
       difference rather than "you selected two". A warning that does not say
       what distinguishes them leaves the reader exactly where they were.

       One table because three places need it and they must not drift: the
       generator's smart analysis, the walkthrough's note, and the wiki
       section that explains the pair in full. `tests/app-overlap.mjs` holds
       them together and checks every member is a real option. */
    var APP_OVERLAP = [
        {
            id: 'fetch',
            what: 'system information tools',
            members: ['pfetch', 'fastfetch'],
            compare: {
                'pfetch': 'POSIX shell, no dependencies, a few kilobytes. It reads ' +
                          '/proc and a handful of files, so it starts instantly and ' +
                          'reports less.',
                'fastfetch': 'Compiled C. Detects far more - GPU, display, packages ' +
                             'across several managers - and is configured in JSON. ' +
                             'Quick, and considerably larger than pfetch.'
            },
            note: 'Both print a logo and a summary when a shell opens, so running ' +
                  'both means seeing two of them every time you open a terminal.',
            wiki: 'fetch-tools'
        },
        {
            id: 'file-manager',
            what: 'graphical file managers',
            members: ['thunar', 'nautilus'],
            compare: {
                'thunar': 'Xfce\'s file manager. Light, fast, and does not pull a ' +
                          'desktop environment in behind it. Bulk rename and custom ' +
                          'actions are its own.',
                'nautilus': 'GNOME Files. Better integrated if you run GNOME, and it ' +
                            'brings GNOME libraries with it whether or not you do.'
            },
            note: 'Only one can be the handler that opens when something asks for a ' +
                  'folder. The other is a second copy of the same job, which is fine ' +
                  'if you meant it.',
            wiki: 'file-managers'
        }
    ];

    /**
     * Overlapping groups the reader has picked more than one member of.
     * @param {string[]} chosen  application ids that are selected
     */
    function appOverlaps(chosen) {
        var picked = chosen || [];
        var out = [];
        APP_OVERLAP.forEach(function (group) {
            var hit = group.members.filter(function (m) {
                return picked.indexOf(m) !== -1;
            });
            if (hit.length > 1) out.push({ group: group, selected: hit });
        });
        return out;
    }

    /** One sentence naming the overlap, then what actually separates them. */
    function appOverlapText(overlap) {
        var g = overlap.group;
        var lines = ['You have selected ' + overlap.selected.length + ' ' + g.what +
                     ': ' + overlap.selected.join(' and ') + '. ' + g.note];
        overlap.selected.forEach(function (m) {
            if (g.compare[m]) lines.push(m + ' - ' + g.compare[m]);
        });
        return lines;
    }

    root.APP_OVERLAP = APP_OVERLAP;
    root.appOverlaps = appOverlaps;
    root.appOverlapText = appOverlapText;

    root.TOOL_SUPPORT = TOOL_SUPPORT;
    root.osToolSupport = toolSupport;
    root.osToolReason = toolReason;

    /* Exported so a gate can compare the tables against each other. A system
       whose map is missing a name the others translate does not fail loudly -
       pkgName() falls through and returns the Arch name, so `apt-get install
       networkmanager` is what reaches the reader. That is the same
       wrong-tooling defect the rest of this file exists to prevent, in a form
       no leakage count notices, so the key sets are held equal by test. */
    root.OS_PKG_NAMES = PKG_NAMES;

    root.OS_INSTALL = OS_INSTALL;
    root.OS_INIT = INIT;
    root.osInstallModel = installModel;
    root.osHasInstallModel = hasInstallModel;
    root.osInitOf = initOf;
    root.osPkgName = pkgName;
    root.osPkgNames = pkgNames;
    root.osPkgUnavailable = pkgUnavailable;
    root.osPkgOverlay = pkgOverlay;

})(typeof window !== 'undefined' ? window : this);
