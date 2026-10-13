# Dead Space 3 Vortex Extension

Version 0.1.0 (initial beta) · Author: Rama2120

Adds Windows Dead Space 3 support to Vortex. Install this extension once, then
manage compatible game-folder mods through Vortex's normal install, enable,
deploy, disable, and purge controls. It is standalone; the Dead Space (2008)
and Dead Space 2 extensions are not dependencies.

## Install the extension

1. Open Vortex and go to **Extensions** (enable Advanced mode if it is hidden).
2. Drop this extension ZIP into the extension installation area, or use
   **Install From File** if your Vortex version offers it.
3. Restart Vortex when prompted.
4. Find **Dead Space 3** in Games and choose **Manage**. Scan for games if needed.
5. If discovery fails, set the game location manually to the folder containing
   both `deadspace3.exe` and `bigfile0.viv`.
6. For hardlink deployment, keep Vortex's mod staging folder on the same drive
   as the game. Install a compatible mod, enable it, then **Deploy Mods**.

This is a Vortex extension ZIP. Install it through Extensions, not as a normal
Dead Space 3 mod, and do not extract it into the game folder. For a manual
extension installation, close Vortex and extract the ZIP into
`%APPDATA%\Vortex\plugins\game-deadspace3`. The `index.js`, `info.json`, and
`gameart.png` files must be directly inside that folder. Avoid duplicate copies.

## Supported mod layouts

- Root DLL, INI, ASI, configuration, ReShade, ENB, and SweetFX files.
- `plugins`, `scripts`, shader, texture, `Core`, `Support`, and `__overlay`
  subfolders, preserved where the archive intends them.
- Ready-to-copy `bigfile*.viv` replacements and `.vp6` videos. Vortex manages
  these as whole files; this extension does not edit or merge VIV archives.
- TexMod `.tpf` packages, stored under `TexMod Packages` in the game folder.

The installer removes shared packaging folders while keeping known game and
runtime folders. It accepts Windows and forward-slash archive paths, ignores
common macOS metadata, rejects unsafe paths, and catches case-insensitive
destination collisions. Mixed packages keep their root files and textures.
FOMOD packages are left to Vortex's own FOMOD installer.

**Patcher-based VIV mods need their author's manual process.** Some DS3 mods
ship `bigfile0.patch` with a script that renumbers the original `bigfile*.viv`
files. This extension rejects those archives rather than pretending that
copying the patch file applies it. It also rejects a replacement
`deadspace3.exe`; executable patching can be store and build specific.

Before deploying a whole-file VIV replacement, preserve the original and read
the mod author's exact target and version requirements. Two mods targeting the
same VIV file conflict; Vortex cannot merge their internal changes. If a mod
instead requires a VIV editor, use its instructions outside this extension.

## TexMod textures

Vortex manages `.tpf` package files. **TexMod is still needed to load them into
the game.** After deployment, choose the packages from
`<game folder>\TexMod Packages` in TexMod and follow the texture author's
launch instructions for your store. Steam and EA App launch behavior can
affect TexMod's ability to start the game. This extension does not launch
TexMod, change `deadspace3.exe` or `deadspace3.par`, or bundle TexMod.

The Vortex file-conflict order is not TexMod's texture load order. If two TPFs
replace the same texture, choose their order inside TexMod as their authors
direct. ReShade and a TPF can coexist as files, but a working runtime
combination still needs to be checked in game.

## Game discovery

Discovery tries these sources in order, validating `deadspace3.exe` and
`bigfile0.viv` before accepting a folder:

1. Vortex's Steam helper, using Steam app ID `1238060`.
2. Vortex's EA App / Origin helper, using the game name.
3. Common EA/Origin/retail registry keys.
4. Common game-library paths on mounted Windows drive letters, with a bounded
   search in top-level library folders.

The scan is read-only and does not recursively crawl disks. Unusual, deeply
nested, or unregistered libraries can be selected manually. This extension
does not manage Dead Space (2008), Dead Space 2, or the 2023 remake.

## Limits and troubleshooting

- This extension manages game-folder files. Save games, user settings, and
  mods requiring a separate patching program follow their author's workflow.
- Standalone EXE installers and batch scripts are never run by this extension.
- Two mods supplying the same `dinput8.dll`, `d3d9.dll`, `.viv`, or other path
  need a conflict choice or author-supported chaining. The extension does not
  combine binaries or archive contents.
- Store updates or file verification may restore game files. If a mod changes
  a base archive, use the author's backup and restore instructions.
- To remove Vortex-managed files, disable the mods and deploy again, or use
  Purge Mods. Check Vortex's deployment backup and conflict prompts when
  replacing an existing game file.
- If Windows denies access to the game folder, use Vortex's normal permission
  prompt or move the game through its launcher to a writable library.

## Validation status

Local automated checks cover registration, discovery, archive layouts,
unsafe paths, collisions, patcher rejection, and staging/link/removal of
harmless fixture files. Read-only detection also checks an installed Steam
copy. The release ZIP is verified against its source and reruns the tests from
the packaged `index.js`.

This initial beta has not completed a live Vortex UI deploy/purge or gameplay
acceptance run. EA App/Origin discovery has fixture coverage, not a live
installation test. TexMod launch and injection on Steam and EA App are not
claimed as validated by the extension checks.

## Credits and license

Dead Space 3 integration: Rama2120. The Dead Space 2 extension was used as a
functional starting point. No game files, TexMod binaries, or third-party mods
are bundled. The game tile is original AI-generated atmospheric artwork, not
an official EA screenshot. The extension code and supplied artwork are
provided under the MIT License to the extent applicable; see `LICENSE.txt`.
Dead Space and related marks belong to Electronic Arts. This community
extension is not affiliated with or endorsed by EA or Nexus Mods.

## References

- [Vortex game extension API](https://github.com/Nexus-Mods/Vortex/blob/master/packages/vortex-api/README.md)
- [Vortex extension packaging](https://github.com/Nexus-Mods/Vortex/wiki/How-to-package-a-game-extension)
- [Dead Space 3 on Steam](https://store.steampowered.com/app/1238060/Dead_Space_3/)
- [Example DS3 TexMod instructions](https://www.nexusmods.com/deadspace3/mods/57)
- [Example DS3 VIV patcher instructions](https://www.nexusmods.com/deadspace3/mods/85)
