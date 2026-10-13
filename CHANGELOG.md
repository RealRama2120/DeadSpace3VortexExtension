# Changelog

## 1.0.1 - 2026-10-13

- Added numeric Nexus Mods game ID `2728` to `info.json` for automatic Vortex catalogue discovery.
- Updated version metadata and publication documentation.
- Runtime code, game discovery, mod deployment, artwork, and license are unchanged from 1.0.0.

## 1.0.0

Standalone release package for Dead Space 3.

- Verified the Steam installation path against an installed copy without changing game files.
- Verified the archive layout, extracted file hashes, and tests against packaged source.
- Reject script-based patch/install archives with clear manual-install guidance.
- Updated version, release documentation, and upload notes.

## 0.1.0

Initial standalone beta release for Dead Space 3.

- Steam, EA App / Origin, registry, mounted-drive, and manual discovery.
- Executable and VIV archive validation before accepting a game folder.
- Game-root mod deployment with preserved plugin, ReShade, and game subfolders.
- Direct VIV and video-file replacement support through Vortex's file deployment.
- TexMod `.tpf` placement in `TexMod Packages`, including mixed archives.
- Archive-wrapper, unsafe-path, and destination-collision checks.
- Manual-install guidance for patcher-based archives and executable replacement.
- Original 640 x 360 game tile, full readable source, documentation, and MIT license.
