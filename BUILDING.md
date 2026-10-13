# Building the extension

Requires Windows, PowerShell and Node.js. Run `.\tools\build.ps1`.

The build validates numeric gameId 2728, metadata, syntax, artwork, six root ZIP entries, extracted hashes and the existing packaged-source regression suite. Outputs go to `../outputs`. The packaged README comes from `docs/INSTALLATION.md`; the repository README is a separate landing page.

Run `node --test .\tests\extension.test.cjs` for the regression suite. Optional live-discovery coverage is enabled only when `DS3_LIVE_PATH` names an existing game installation. Tests do not launch the game or deploy to an actual game folder.

Historical packages are under `versions`. Rebuilding does not recreate their exact original ZIP bytes.

