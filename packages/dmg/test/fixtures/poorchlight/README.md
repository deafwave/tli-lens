# Vendored poorchlight test inputs

Copied byte-for-byte from the sibling poorchlight repository at commit
`eb7fa9ba2ea426e3c53aad3eb633440ba201d535` so the test suite does not depend on
whatever poorchlight happens to have checked out:

- `tli_dump/data/compendium-catalog-ss13.json`
  - SHA-256: `c7b5392533305d5b4ed91e1c8efe01a5b5ea0e7d64d7636b9cfb8d55ae24b796`
  - The audited compact catalog pinned by `AUDITED_SS13_COMPACT_CATALOG_SHA256`
    and `POORCHLIGHT_SS13_IDENTITY_SOURCE`.
- `tli_dump/ui/fixtures/rust-portable-snapshot.json`
  - SHA-256: `054a54d4b691f3eb2e86e143e370f228bba320b1dd1c14b7bbfd963df9829304`

Do not hand-edit. To adopt a newer catalog: copy it from poorchlight, re-audit
it, update the raw and canonical SHA-256 pins in
`packages/dmg/src/playerDefenseEvidence.ts` and `packages/dmg/src/bingIntrinsic.ts`,
then re-baseline the player-defence expectations that depend on its contents.
