---
name: material3-design
description: Use this skill to generate well-branded interfaces and assets in Google's Material 3 (Material You) design language — for production code or throwaway prototypes, mocks, slides, and design explorations. Contains the M3 token system (color, type, shape, elevation, motion, state-layers), font + icon font setup, and a working UI kit of React components built against those tokens.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.) copy the relevant assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with Material 3.

Quick map:

- `README.md` — full system overview, content fundamentals, visual foundations, iconography.
- `colors_and_type.css` — all `--md-sys-*` tokens (color, type, shape, elevation, motion, state-layers, spacing). Import this first.
- `assets/` — wordmark + a starter set of M3 icon SVGs. Most icons should load from the Material Symbols variable font on Google Fonts CDN; the CSS already imports it.
- `preview/` — single-card swatch / specimen / component HTML files (also what populates the Design System tab).
- `ui_kits/material3/` — a full working React UI kit (Mail demo) showing how every component composes. `M3Components.jsx` is the component library; `Screens.jsx` is the screens; `M3App.jsx` is the root.

If the user invokes this skill without further guidance, ask them what they want to build, ask a few clarifying questions (audience, surface, density, light/dark, baseline vs custom seed), then act as an expert designer who outputs HTML artifacts or production code, whichever fits the need.

**Hard rules — do not break these:**
- Sentence case in all UI copy. Title case is for proper nouns only.
- Never invent a new color outside the palette tokens. If a hue is missing, reseed the palette (see `colors_and_type.css` instructions) — do not hand-pick.
- Use Material Symbols for every icon. Never use emoji.
- Use the elevation tokens (5 levels) — do not invent new shadows.
- Use the motion tokens (`--md-sys-motion-easing-*`, `--md-sys-motion-duration-*`) — no `ease-in-out`, no bounces.
- Buttons are always pill-shaped (`border-radius: 9999px`) and use `label-large` type (14/20 weight 500).
- FAB defaults to `primary-container` colors, NOT `primary`.
- Surface containers replace M2's elevation overlays — pick the right surface tone for depth, don't stack opacities.
