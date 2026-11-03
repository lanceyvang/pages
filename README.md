# pages

A public shelf for things worth sharing, served via **GitHub Pages** at
**https://lanceyvang.github.io/pages/**.

This repo exists so public, shareable pages don't have to live in private project
repos. Each item gets its own folder; the root `index.html` links to them.

## Layout

```
index.html            # the hub — lists everything hosted here
<item-slug>/          # one folder per hosted item
  index.html
```

## Add a new item

1. Drop it in its own folder: `<item-slug>/index.html` (self-contained HTML).
2. Add a card linking to `./<item-slug>/` in the root `index.html`.
3. Commit and push to `main` — Pages redeploys automatically.

Live URL for an item: `https://lanceyvang.github.io/pages/<item-slug>/`

## Hosted items

- **`mamdani-cancel/`** — Empire Clear, a premium concept mockup for the NYC
  click-to-cancel / junk-fee app. Design tokens live in the project's `DESIGN.md`.
- **`five-rides/`** — Five Rides to Tableau, a narrated study course for the
  Tableau Desktop Foundations exam. An installable PWA: manifest, service worker
  that caches the page and all narration for offline use, and a two-pane layout
  on unfolded foldables. Built from the course project's `build/pwa.py`.
