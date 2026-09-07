# Type Mixer

A playful, local-first typography workbench for comparing font pairings, testing highlighted copy, and collecting type inspiration from around the web.

## Run locally

```sh
cd type-mixer
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Add a permanent font

The public catalog lives in [`fonts.js`](./fonts.js). Add one object with:

```js
{
  id: "font-slug",
  name: "Font Name",
  category: "serif", // serif, sans, mono, or display
  status: "ready", // ready or reference
  cssFamily: '"Font Name", serif',
  cssUrl: "https://fonts.googleapis.com/...", // only for embeddable webfonts
  sourceUrl: "https://official-font-source.example",
  exampleUrl: "https://site-using-the-font.example",
  license: "OFL"
}
```

Use `status: "reference"` for commercial, custom, or unverified fonts. Do not commit paid font files unless their license explicitly allows redistribution.

## Add a font while browsing

The **Add a font** panel supports:

- Google Fonts, Bunny Fonts, or Fontsource stylesheet URLs saved in the current browser.
- Local WOFF2, WOFF, TTF, or OTF files loaded for the current tab only.
- A **Font Finder** bookmarklet that collects rendered family names and the source webpage.
- A prefilled GitHub issue for permanent font suggestions.

Browser-only additions use local storage. The app has no account, analytics, backend, or font-file uploads.

## Files

- `index.html` — accessible page structure and metadata.
- `styles.css` — responsive light/dark visual system and animations.
- `fonts.js` — data-driven public font catalog.
- `app.js` — pairing, highlighting, library, import, bookmarklet, and persistence behavior.
