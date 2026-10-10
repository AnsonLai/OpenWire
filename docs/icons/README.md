# OpenWire icon

Editorial cards is the selected identity. `icon.svg` is the canonical vector,
with the mark centered on an ivory tile. The header loads this same SVG.
PNG exports and the favicon are rendered from it; maskable exports add padding
to keep the artwork inside the central 80% safe circle.

To regenerate, make the Sharp Node module available and run:

```sh
node scripts/generate-icons.mjs
```

An installed Sharp module directory can also be passed as the first argument.
Sharp is only needed for asset authoring. Then run `npm run build:docs` to
refresh the GitHub Pages assets. The original concept is preserved in
`design/openwire-icons-2026-10-09/03-editorial-cards.png`.
