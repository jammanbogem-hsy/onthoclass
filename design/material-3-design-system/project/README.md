# Material 3 Design System

A faithful reconstruction of **Google's Material 3** (Material You) design language — the system that ships in Android, Google's apps, and the open-source Material Components libraries.

This system is the canonical "expressive, accessible, adaptive" baseline. The full color story is built around dynamic color with a single seed, generated tonal palettes for primary/secondary/tertiary/neutral/neutral-variant/error, and semantic surface containers. **This kit ships a custom brand palette:** Primary **Teal `#0F6E56`** (청록), Secondary **Peach `#F5C4B3`** (피치, sits at S-80), Tertiary **Sage `#C0DD97`** (세이지, sits at T-80), and a brand-specific **Mint `#E1F5EE`** (민트) bound to `--md-sys-color-primary-container`. Type is delivered through the **Roboto** family (with Roboto Flex variable axes), and iconography through **Material Symbols** (a variable icon font, three styles × three fills × seven weights). Type is delivered through the **Roboto** family (with Roboto Flex variable axes), and iconography through **Material Symbols** (a variable icon font, three styles × three fills × seven weights).

## Sources

- **Figma file:** *Material 3 Design Kit (Community)* — Google's official Community kit. The .fig is mounted as the virtual source of truth for this system. 32 pages, 60 top-level frames, 5,597 local components, ~87k nodes total. The Community URL is `https://www.figma.com/community/file/1035203688168086460`.
- **Public docs:** [m3.material.io](https://m3.material.io) — design guidelines, tokens, accessibility notes.
- **Code references:** [github.com/material-components](https://github.com/material-components) (Web, Android, iOS, Flutter), and [Material Web Components](https://github.com/material-components/material-web).
- **Type:** [Roboto](https://fonts.google.com/specimen/Roboto) / [Roboto Flex](https://fonts.google.com/specimen/Roboto+Flex) / [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono) on Google Fonts.
- **Icons:** [Material Symbols](https://fonts.google.com/icons) — served via Google Fonts as a single variable font (axes: `FILL`, `wght`, `GRAD`, `opsz`).

> Note: this kit uses the **baseline** M3 scheme (purple seed) as the default. In production, M3 expects **dynamic color** — a runtime-generated scheme derived from a user wallpaper or brand seed. The token *names* never change; only their values are reseeded.

---

## Content Fundamentals

Material's voice is calm, functional, and second-person. Copy is written *for* the user, not at them.

**Tone**
- Plain, direct, helpful. Avoid jargon and marketing flourishes.
- Address the user as **you**. Refer to the system in third person or omit it ("Sign in", not "Let us help you sign in").
- Prefer verbs to nouns: "Send", "Save changes", "Add to cart" — not "Submission" or "Cart entry".

**Casing**
- **Sentence case everywhere** in UI — buttons, menu items, headings, snackbars, dialog titles. ("Save changes", not "Save Changes".)
- Title case is reserved for proper nouns and product names.

**Length**
- Buttons: 1–3 words; never wrap.
- Snackbars: ≤ 1 line of text + ≤ 1 action.
- Dialog titles: ≤ 1 line; bodies kept to 1–2 short paragraphs.
- Empty states: one short sentence + one action.

**Specifics**
- Numbers: numerals everywhere (3 messages, not three).
- Dates: localized via the Intl APIs — never hardcode the format.
- Errors: describe what happened and how to fix it. "Email already in use. Sign in instead?" — not "Error 409".
- Permissions: explain *why* you need the data before asking.

**Emoji**
- Not part of the system. Use **Material Symbols** for any icon need.

**Sample microcopy**
- Primary action: `Continue`, `Done`, `Save`, `Sign in`
- Destructive confirm: `Delete` (paired with a `Cancel` text button)
- Empty state: "No messages yet. Start a conversation."
- Error: "Couldn't connect. Check your network and try again."
- Snackbar: "Photo deleted." + action `Undo`

---

## Visual Foundations

### Color
- **Tonal palettes.** Each role color (Primary, Secondary, Tertiary, Neutral, Neutral Variant, Error) generates a 13-stop tonal palette: `0, 10, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100`. UI roles pick specific stops — e.g. `Primary = P-40` (light) / `P-80` (dark).
- **Brand seeds in use:**
  - **Teal `#0F6E56`** → Primary (P-40). All 13 P-tones derived from this seed.
  - **Peach `#F5C4B3`** → Secondary container (sits at S-80). Darker Secondary roles step into a grounded terracotta; lighter roles wash up to cream.
  - **Sage `#C0DD97`** → Tertiary container (T-80). Darker Tertiary roles step toward olive.
  - **Mint `#E1F5EE`** → bound directly to `--md-sys-color-primary-container` as a brand override; reads as a fresh, ultra-light wash that pairs with on-primary-container `#003822`.
- **Surfaces are tinted neutrals**, not pure greys. Light surface = `#FEF7FF`. Five `surfaceContainer*` tones replace M2's elevation overlays.
- **Error** is built on Material's reference red palette (`#B3261E` light / `#F2B8B1` dark).
- See `colors_and_type.css` for the full token list and `preview/colors-*.html` for the swatch cards.

### Typography
- **Roboto / Roboto Flex** as the primary family; **Roboto Mono** for code; **Google Sans Text / Google Sans** used by Google product surfaces (substituted via Google Fonts where licensed).
- 15-step scale, three weights per step (Regular / Medium / Bold) plus an *Emphasized* track that swaps Medium → Bold.
- Steps: `display-{lg,md,sm}`, `headline-{lg,md,sm}`, `title-{lg,md,sm}`, `body-{lg,md,sm}`, `label-{lg,md,sm}`.

### Shape
- 6-stop scale: `none (0)`, `xs (4)`, `sm (8)`, `md (12)`, `lg (16)`, `xl (28)`, `full (9999)`. Plus growth variants `lg-increased (20)`, `xl-increased (32)`, `xxl (48)`.
- Components carry a default shape *role* (e.g. FAB = `lg`, dialog = `xl`, chip = `sm`, icon-button square = `full`).

### Elevation
- Five levels (0–5) expressed through **layered shadows**, never opacity overlays in the light scheme:
  - L0: none
  - L1: `0 1px 2px rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15)`
  - L2: `0 1px 2px rgba(0,0,0,0.30), 0 2px 6px 2px rgba(0,0,0,0.15)`
  - L3: `0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.30)`
  - L4: `0 6px 10px 4px rgba(0,0,0,0.15), 0 2px 3px rgba(0,0,0,0.30)`
  - L5: `0 8px 12px 6px rgba(0,0,0,0.15), 0 4px 4px rgba(0,0,0,0.30)`
- In the dark scheme, surfaces *also* lighten toward `surface-container-highest` to convey lift.

### Motion
- **Easing tokens** (the "emphasized" set is M3's signature):
  - `standard` = `cubic-bezier(0.2, 0, 0, 1)`
  - `standard-accelerate` = `cubic-bezier(0.3, 0, 1, 1)`
  - `standard-decelerate` = `cubic-bezier(0, 0, 0, 1)`
  - `emphasized` = `cubic-bezier(0.2, 0, 0, 1)` (used with longer durations for hero transitions)
  - `emphasized-accelerate` = `cubic-bezier(0.3, 0, 0.8, 0.15)`
  - `emphasized-decelerate` = `cubic-bezier(0.05, 0.7, 0.1, 1)`
- **Duration tokens:** short1 50, short2 100, short3 150, short4 200, medium1 250, medium2 300, medium3 350, medium4 400, long1 450, long2 500, long3 550, long4 600, extra-long1 700, extra-long2 800, extra-long3 900, extra-long4 1000.
- No bounces. No spring overshoot. M3 favors gentle deceleration with a stronger initial push for hero moments.

### Interaction states (state layers)
- Every interactive surface uses a **state layer** — a tinted overlay applied on top of the resting fill.
- Opacity ramps (applied with the "on" color for the role — e.g. on-primary over primary):
  - hover `0.08`, focus `0.12`, pressed `0.12` (kept symmetrical with focus), dragged `0.16`.
- Press has no shrink/scale — only the state layer + the ripple (omitted in this kit; the layer alone reads enough for static mocks).
- Focus shows a **focus ring**: 3px solid `secondary` offset by 2px outside the component.

### Borders, dividers, outlines
- Buttons/inputs use a 1px `outline` color stroke (light: `NV-50` / dark: `NV-60`). Outline-variant is the much lighter version reserved for dividers and disabled fields.
- Dividers are 1px `outline-variant`. No drop shadow; never use a darker line.

### Cards and surfaces
- Cards default to `surface-container-low` fill with **no border**, rounded `lg (12dp)`. Elevated cards add L1; outlined cards add a 1px `outline-variant` stroke and stay at L0.
- The surface system replaces the old "elevation overlay" trick — pick the surface container that matches the intended depth.

### Backgrounds and imagery
- The system is **screen-first** — no decorative full-bleed photography, no patterns, no textures. The "expressive" direction adds large **shape primitives** (pill, scallop, ellipse) but they're filled flat in tonal palette colors, not gradients.
- A single linear gradient is permitted for **hero containers** in the expressive direction; it always uses two adjacent tones of the same palette (e.g. `P-90 → P-95`).
- Transparency and blur are used **only** for system surfaces (top app bar over scrolled content, modal scrim at `Scrim @ 32%` opacity). No frosted-glass card chrome.

### Iconography (summary)
- Material Symbols variable font. Defaults: `wght 400, FILL 0, GRAD 0, opsz 24`. See **Iconography** below for full guidance.

---

## Iconography

**System:** [Material Symbols](https://fonts.google.com/icons) — a single variable font Google ships with the design system.

- Three styles: **Outlined** (default), **Rounded**, **Sharp**.
- Four variable axes:
  - `FILL` 0 → 1 (toggles between line and filled glyphs — animatable)
  - `wght` 100–700 (icon stroke weight; pair with type weight)
  - `GRAD` -50, 0, 200 (grade — fine optical adjustment for dark backgrounds)
  - `opsz` 20, 24, 40, 48 (optical size — stroke compensates so smaller icons stay readable)
- Default optical/style combo: **Outlined, wght 400, opsz 24, FILL 0**.

**Usage**
- 24dp is the standard target. 20dp inside dense lists/menus, 40/48dp for empty states and FABs.
- Pair stroke weight to text weight nearby (`wght 400` for body, `wght 500` for emphasized labels).
- Animate `FILL` 0→1 on selection (e.g. bottom nav, switch, favorite) over `medium2` duration with `emphasized` easing.
- Color comes from the surrounding text role — usually `on-surface-variant` for chrome, `primary` for selected/active, `error` for destructive.

**Loading the font**

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" />
```

```html
<span class="material-symbols-outlined">favorite</span>
```

**Emoji:** not used by Material. Use Material Symbols instead.
**Unicode glyphs:** avoid for UI affordances — use the icon font for visual consistency.

`assets/icons/` contains a starter set of common symbols copied from the Figma file for offline use; everything else loads from the Google Fonts CDN.

---

## Index

- `README.md` — this file.
- `SKILL.md` — agent-skill manifest, for using this system inside Claude Code or another agent.
- `colors_and_type.css` — every color, type, shape, elevation, motion and state token as CSS custom properties. **Import this first.**
- `assets/` — wordmark + a starter set of icon SVGs (everything else loads from the Material Symbols CDN).
- `preview/` — the small HTML specimen cards. One per concept: each palette (primary/secondary/tertiary/error/neutral/neutral-variant), semantic-roles light + dark, surfaces, type families, display+headline, title/body/label, shape, elevation, spacing, motion, state layers, plus one card per component cluster (buttons, FAB & icon-buttons, form, chips, cards, navigation, icons, brand).
- `ui_kits/material3/` — the component UI kit. Open `index.html` for the interactive **Mail** demo (Inbox / Compose / Settings) that exercises buttons, FAB, chips, switches, text fields, dialogs, snackbars, lists, navigation rail, and the top app bar / search bar.

### UI kits

| Kit | Surface | Entry |
|---|---|---|
| `ui_kits/material3/` | Generic Material 3 product (Mail) | [`index.html`](ui_kits/material3/index.html) |

## Caveats

- The Figma file uses **Google Sans Text** alongside Roboto. Google Sans is not freely licensed; this system substitutes **Roboto** (the public sibling) throughout. If you ship for a real Google product surface, replace the `--font-sans` stack with Google Sans.
- Dynamic color generation (HCT → tonal palette algorithm) is *not* implemented here — the baseline purple scheme is hardcoded. Re-seed in production using [`@material/material-color-utilities`](https://github.com/material-foundation/material-color-utilities).
