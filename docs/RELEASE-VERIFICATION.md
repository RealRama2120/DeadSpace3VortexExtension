# Version 1.0.1 verification

Verified on October 13, 2026.

- Metadata: Rama2120, version 1.0.1, numeric Nexus game ID 2728.
- JavaScript syntax, 640 by 360 PNG below 1 MB, and exact six root ZIP files passed.
- Every extracted package hash matches its packaging source.
- Existing packaged-source regression suite: 45 passed, zero failed, 0 skipped.
- Runtime `index.js`, artwork, and license are identical to the previous 1.0.0 package.
- Original historical archives and checksum sidecars are preserved unchanged.

The existing read-only installed-Steam detection check passed. It does not launch the game or deploy mods into its installation.
The test suite's deployment/removal fixture uses harmless generated files in its
own test-artifacts folder. No game was launched or modified for this release.
This metadata update does not establish new gameplay or storefront compatibility.

Install ZIP SHA-256: `3e6aeedcd183169ea11eea654b1592d377c6fdcff7c85d85508fca53285d056a`

Runtime source SHA-256: `54cf65521f2c1dec436a9d39cd67bcaefec18a5fb5981147538807d929609050`

Nexus page: https://www.nexusmods.com/site/mods/2365
