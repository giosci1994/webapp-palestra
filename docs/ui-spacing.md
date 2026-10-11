# UI spacing and safe areas

The rules for padding inside cards and for the phone's safe areas. The classes are in `frontend/src/index.css`.

## Cards (`.glass-card`)

Text, icons, buttons and hover backgrounds must not touch the rounded edges of a card.

| Class | Padding | Use it for |
|-------|---------|------------|
| `p-card-inner` | 24px on every side | Forms, single cards (plans, gyms, records, stats) |
| `px-card-inner` | 24px left and right | Edge-to-edge lists, where the hover background spans the whole width; clickable headers |
| `py-card-inner` | 24px top and bottom | Vertical padding only |

Edge-to-edge lists inside a card:
- items: `px-card-inner py-5` (24px sides, 20px top and bottom);
- last item: add `card-list-ultimo`, which moves it away from the bottom edge (28px) and follows the card's rounded corners, hover included.

Prefer these classes to ad-hoc `p-3`…`p-8` on cards and panels.

## Safe areas (PWA)

With `viewport-fit=cover` the app covers the whole screen, under the status bar (notch, island) and the gesture bar too. The insets are CSS variables: `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right`.

- **Main layout** (`LayoutAutenticato.jsx`): top `calc(24px + var(--safe-top))`, bottom `calc(24px + var(--safe-bottom))`, sides `calc(clamp(16px, 4vw, 32px) + var(--safe-left/right))`. Full-screen pages (the workout in progress) set these to 0 and handle the insets themselves.
- **Mobile navigation bar**: the page keeps `calc(72px + var(--safe-bottom))` free at the bottom.
- **Chat conversation**: header `paddingTop: calc(16px + var(--safe-top))`, message bar `paddingBottom: calc(16px + var(--safe-bottom))`, so the bubbles scroll under both.
- **AI assistant**: message bar `px-card-inner pt-3 pb-[calc(12px+var(--safe-bottom))]`.
- **Drawers and bottom sheets**: always add `var(--safe-bottom)` to the bottom padding (and `var(--safe-top)` to anything at the top of the screen).

## Inputs

Inputs, textareas and selects are at least 16px: below that, iOS zooms in when they get the focus.
