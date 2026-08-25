# Credits

Everything the demo ships that did not originate here, with its source and its
rights, per file. Nothing in this list was taken on the strength of its
collection being "open access" — see the note under *How this was verified*.

## Specimen photographs — Smithsonian NMNH, 24 files

**Collection:** Smithsonian Institution, National Museum of Natural History,
Department of Mineral Sciences. **Rights:** CC0 (public domain dedication), per
record, for both the image and the metadata. **Verified:** 24 August 2026.

### How this was verified

Smithsonian Open Access is **not** a blanket dedication over the whole
catalogue: within one museum, one department, and often one shelf, some records
release their images under CC0 and others carry *Usage Conditions Apply*. The
metadata and the image are also rated **separately** — a record can be CC0
metadata over a restricted photograph, which is the trap, because a metadata
field alone reads as a green light.

So each of the 24 was checked on **its own** `si.edu/object/…` page, live, and
two things had to hold at once:

1. the media container is `media--openaccess` (the CC0 badge is the one shown
   beside the image), and
2. *Metadata Usage* reads `CC0`.

The check was calibrated against a known negative from the same museum: *The
Hope Diamond* (`siris_sic_8819`) returns `media--no-openaccess` and *Usage
conditions apply*, and a second Hope Diamond record (`siris_arc_402896`) is
`media--no-openaccess` **with** CC0 metadata — the exact combination that a
metadata-only check would have waved through. All 24 records below passed both
tests; none is included on the strength of the collection alone.

### Alterations

Each photograph was cut out from its background and re-encoded to WebP. The
background removal is the only edit; no colour grading, retouching or
recomposition.

The cut is made **for a near-black page**, which is a different job from cutting
for print. A matte lifted against a museum's white cloth leaves the edge ramp
carrying that white: invisible over paper, a milky halo over `#08080A`. Two
things prevent it — the mask is eroded before it is feathered, so the ramp sits
on pixels that were interior to the specimen, and every transparent pixel's RGB
is overwritten with the nearest foreground colour, so neither the browser's
resampling nor the WebP encoder can pull the background back in. Cast shadows
are removed as background (same chromaticity as the cloth, lower luminance);
scale bars and printed labels fall away with the largest-blob selection.

The pipeline is committed at `apps/demo/tools/cutout.py` so the claim above is
checkable rather than asserted. It was run once; the results are the committed
`.webp` files, and nothing fetches or reprocesses anything at build time.

### The records

### `aquamarine-connecticut` — Beryl (var. aquamarine)

- **Object:** Beryl (var. aquamarine), NMNH G779-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1004981>
- **GUID:** <http://n2t.net/ark:/65665/3bf8b5c6f-4da2-400b-a731-448d591bd644>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-10K0222-G779-00-nr.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/aquamarine-connecticut.webp` — 640×560 px, 50 KB,
  cut out from the source JPEG; no other alteration.
### `spessartine` — Spessartine

- **Object:** Spessartine, NMNH G152-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1007495>
- **GUID:** <http://n2t.net/ark:/65665/3ca62532a-8575-495e-8fb3-a16f02f2a144>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-0100105-G152.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/spessartine.webp` — 279×309 px, 12 KB,
  cut out from the source JPEG; no other alteration.
### `afghanite` — Afghanite

- **Object:** Afghanite, NMNH G10675-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_10209863>
- **GUID:** <http://n2t.net/ark:/65665/31e78eab3-395b-4e9b-869d-44c477e6e837>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-NMNH-MS-2018-00047.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/afghanite.webp` — 529×439 px, 27 KB,
  cut out from the source JPEG; no other alteration.
### `fluorite-vietnam` — Fluorite

- **Object:** Fluorite, NMNH G10658-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_10209869>
- **GUID:** <http://n2t.net/ark:/65665/325634ef8-1732-4f3e-b39f-94f30625ed8b>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-NMNH-MS-2018-00102.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/fluorite-vietnam.webp` — 545×640 px, 54 KB,
  cut out from the source JPEG; no other alteration.
### `spinel` — Spinel

- **Object:** Spinel, NMNH G10558-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_10209994>
- **GUID:** <http://n2t.net/ark:/65665/3c658a7c3-992b-475e-8e30-d443acb3bc25>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-NMNH-MS-2018-00125.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/spinel.webp` — 640×571 px, 31 KB,
  cut out from the source JPEG; no other alteration.
### `vivianite` — Vivianite

- **Object:** Vivianite, NMNH 119189-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1056759>
- **GUID:** <http://n2t.net/ark:/65665/3ae0fc6bb-e7e9-41d6-b7b5-baf10ef1944a>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-06k0543-119189-00-nr.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/vivianite.webp` — 640×611 px, 111 KB,
  cut out from the source JPEG; no other alteration.
### `sulfur-sicily` — Sulfur

- **Object:** Sulfur, NMNH 138633-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1076081>
- **GUID:** <http://n2t.net/ark:/65665/3c5a4f844-98c1-4bcb-9657-6d1e73359e6e>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-05k0116-138633-00.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/sulfur-sicily.webp` — 640×588 px, 61 KB,
  cut out from the source JPEG; no other alteration.
### `diamond` — Diamond

- **Object:** Diamond, NMNH 140600-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1078091>
- **GUID:** <http://n2t.net/ark:/65665/366a3b493-29ea-4476-aad3-8b753a3729ac>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-05k0341-140600-00.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/diamond.webp` — 518×483 px, 26 KB,
  cut out from the source JPEG; no other alteration.
### `emerald` — Beryl (var. emerald)

- **Object:** Beryl (var. emerald), NMNH 142510-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1079782>
- **GUID:** <http://n2t.net/ark:/65665/310d1da3b-65f1-4926-b2f5-97e66a883b18>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-07k0090-142510-00-nr.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/emerald.webp` — 640×525 px, 92 KB,
  cut out from the source JPEG; no other alteration.
### `azurite` — Azurite

- **Object:** Azurite, NMNH 144456-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1081797>
- **GUID:** <http://n2t.net/ark:/65665/3fc3191e8-89c4-4d23-98e1-e367fcec16ed>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-144456AzuriteWith.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/azurite.webp` — 640×467 px, 76 KB,
  cut out from the source JPEG; no other alteration.
### `galena` — Galena

- **Object:** Galena, NMNH 147195-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1084595>
- **GUID:** <http://n2t.net/ark:/65665/312d824ba-3ec0-43b7-bc4b-0d47dd77006f>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-08k0371-147195-00-nr.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/galena.webp` — 640×579 px, 103 KB,
  cut out from the source JPEG; no other alteration.
### `sphalerite` — Sphalerite

- **Object:** Sphalerite, NMNH 148306-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1085716>
- **GUID:** <http://n2t.net/ark:/65665/3dd815947-36a4-4226-879a-40237f1aae58>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-10K1276-148306-00-nr.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/sphalerite.webp` — 640×507 px, 74 KB,
  cut out from the source JPEG; no other alteration.
### `aquamarine-nagar` — Beryl (var. aquamarine)

- **Object:** Beryl (var. aquamarine), NMNH 168412-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1105408>
- **GUID:** <http://n2t.net/ark:/65665/329363029-f51d-4428-801e-836f8a0e9ff0>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-506077.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/aquamarine-nagar.webp` — 640×529 px, 40 KB,
  cut out from the source JPEG; no other alteration.
### `fluorite-westmoreland` — Fluorite

- **Object:** Fluorite, NMNH 171349-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1108019>
- **GUID:** <http://n2t.net/ark:/65665/3650df830-39ed-44ae-a413-94dd442c5393>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-05k0083-171349-00.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/fluorite-westmoreland.webp` — 640×360 px, 48 KB,
  cut out from the source JPEG; no other alteration.
### `lazurite` — Lazurite

- **Object:** Lazurite, NMNH 171593-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1108266>
- **GUID:** <http://n2t.net/ark:/65665/3a51a42b0-744f-4ab4-a2c1-416199fd0650>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-171593LazuriteWith.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/lazurite.webp` — 640×520 px, 58 KB,
  cut out from the source JPEG; no other alteration.
### `aurichalcite` — Aurichalcite

- **Object:** Aurichalcite, NMNH 87824-01 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1119075>
- **GUID:** <http://n2t.net/ark:/65665/3f41aa607-47ab-4a20-933d-ac14d0e0d568>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-87824_1.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/aurichalcite.webp` — 487×318 px, 42 KB,
  cut out from the source JPEG; no other alteration.
### `malachite` — Malachite

- **Object:** Malachite, NMNH B14193-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1130454>
- **GUID:** <http://n2t.net/ark:/65665/38333a8c9-9d21-4bf0-8144-02465a795900>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-malachiteafterazuritecoatedwquartz.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/malachite.webp` — 640×592 px, 77 KB,
  cut out from the source JPEG; no other alteration.
### `quartz-bagdad` — Quartz

- **Object:** Quartz, NMNH C6373-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1155264>
- **GUID:** <http://n2t.net/ark:/65665/32536a1d8-c77c-41d1-9aea-2be3ba99164b>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-05k0422-C6373-00.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/quartz-bagdad.webp` — 640×536 px, 106 KB,
  cut out from the source JPEG; no other alteration.
### `sulfur-agrigento` — Sulfur

- **Object:** Sulfur, NMNH R12231-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1159517>
- **GUID:** <http://n2t.net/ark:/65665/357b51863-e521-4dde-900a-3b89f021b9e9>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-05k0033-R12231-00.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/sulfur-agrigento.webp` — 640×528 px, 57 KB,
  cut out from the source JPEG; no other alteration.
### `corundum` — Corundum

- **Object:** Corundum, NMNH 176171-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_11659967>
- **GUID:** <http://n2t.net/ark:/65665/3acc23f9e-5a88-450c-b932-73ae8ca1d7a9>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-13k0618.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/corundum.webp` — 640×624 px, 47 KB,
  cut out from the source JPEG; no other alteration.
### `agate` — Quartz (var. agate)

- **Object:** Quartz (var. agate), NMNH R18965-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1166741>
- **GUID:** <http://n2t.net/ark:/65665/349ff0422-7267-4c8b-8ed4-46c9e0373e1e>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-508043.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/agate.webp` — 640×577 px, 62 KB,
  cut out from the source JPEG; no other alteration.
### `smithsonite` — Smithsonite

- **Object:** Smithsonite, NMNH R8520-01 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1177142>
- **GUID:** <http://n2t.net/ark:/65665/3db60cbcf-a35f-460f-96e8-b60b706577eb>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-0200152-R08520-1D-000001.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/smithsonite.webp` — 640×431 px, 60 KB,
  cut out from the source JPEG; no other alteration.
### `copper` — Copper

- **Object:** Copper, NMNH 125401-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1180452>
- **GUID:** <http://n2t.net/ark:/65665/36bb08a39-89af-4dc6-b692-295375baaba5>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-0300127-125401-00.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/copper.webp` — 640×448 px, 63 KB,
  cut out from the source JPEG; no other alteration.
### `dravite` — Dravite

- **Object:** Dravite, NMNH G10203-00 — National Museum of Natural History, Mineral Sciences
- **Record:** <https://www.si.edu/object/nmnhmineralsciences_1350621>
- **GUID:** <http://n2t.net/ark:/65665/3b6de4937-e2dc-4403-a6eb-73a556e00eaa>
- **Image:** <https://ids.si.edu/ids/download?id=NMNH-05k0532-G10203-00.jpg>
- **Rights, image:** CC0 — the record page carries the CC0 badge on the image
  (`media--openaccess`), not "Usage Conditions Apply".
- **Rights, metadata:** CC0 (Metadata Usage on the record page).
- **In this repo:** `assets/objects/dravite.webp` — 464×398 px, 26 KB,
  cut out from the source JPEG; no other alteration.

## Emoji graphics — Twemoji, 24 files

- **Source:** Twemoji 17.0.3 — <https://github.com/jdecked/twemoji>
- **Files:** `assets/emoji/*.svg`, taken unmodified from `assets/svg/` at that tag.
- **Rights:** graphics licensed **CC-BY 4.0** —
  <https://creativecommons.org/licenses/by/4.0/>. Attribution: Twemoji, by
  Twitter and the Twemoji contributors; the fork is maintained by jdecked.
- **Alterations:** none. The files are byte-identical to the upstream SVGs.

## Interaction reference

The plane's behaviour — the finite draggable world, the reveal as objects enter
the frame, the grid, the flight into the detail panel — was modelled on
**[Palmer Dinnerware](https://palmer-dinnerware.com)**.

Nothing of theirs is used here: no code, no assets, no copy, no markup. The
reference was watched, described, and rebuilt. Palmer Dinnerware is credited
because that is where the pattern was seen, and for no other reason — there is
no affiliation, sponsorship, or endorsement in either direction.

## The library and its dependencies

- `vitrina` — MIT, this repository.
- `gsap` — GreenSock, a **peer** dependency and never bundled: GSAP's standard
  licence is free for commercial use but is not MIT, and keeping it a peer keeps
  the library's own MIT grant clean.
