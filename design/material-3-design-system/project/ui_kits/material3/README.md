# Material 3 UI Kit

A working, click-thru reconstruction of a typical Material 3 app surface. Built directly against the tokens in `../../colors_and_type.css`.

The demo screen is **Mail** — a familiar Google product surface that exercises the maximum amount of the M3 component set: navigation rail, large top app bar, list with state layers, FAB, search bar, snackbars, dialogs, chips, switches.

## Files

- `index.html` — interactive demo (Mail). Click navigation, open messages, compose, tweak settings.
- `M3App.jsx` — root layout & screen switcher.
- `TopAppBar.jsx`, `NavRail.jsx`, `BottomBar.jsx` — chrome.
- `Button.jsx`, `IconButton.jsx`, `FAB.jsx` — actions.
- `Chip.jsx`, `Switch.jsx`, `Checkbox.jsx`, `TextField.jsx` — controls.
- `Card.jsx`, `ListItem.jsx`, `Dialog.jsx`, `Snackbar.jsx`, `SearchBar.jsx` — surfaces.
- `screens/Mail.jsx`, `screens/Compose.jsx`, `screens/Settings.jsx` — the three screens wired into the demo.

## Conventions

- Every component imports tokens via the `--md-sys-*` CSS variables. No hardcoded colors.
- State is a thin `useState` per screen — these aren't production components, just hi-fi recreations.
- Components render with the **Outlined** Material Symbols set.
- `data-screen-label="Mail / Inbox"` etc. on each screen root for comment routing.
