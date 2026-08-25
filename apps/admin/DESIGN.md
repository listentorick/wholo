---
name: Stocdup Admin
description: The distributor-side operational console for Stocdup — navy command surface, cobalt signal, amber flag.
colors:
  deep-navy: "#0B1D3A"
  cobalt-signal: "#1565FF"
  cobalt-signal-hover: "#0F52D6"
  amber-flag: "#F2864D"
  surface: "#FFFFFF"
  canvas: "#F2F4F7"
  topbar-bg: "#FAFBFC"
  border: "#E6ECF2"
  muted: "#5B6B7F"
  status-green-bg: "#DCFCE7"
  status-green-text: "#15803D"
  status-yellow-bg: "#FEF9C3"
  status-yellow-text: "#A16207"
  status-red-bg: "#FEE2E2"
  status-red-text: "#B91C1C"
  status-blue-bg: "#DBEAFE"
  status-blue-text: "#1D4ED8"
  status-orange-bg: "#FEF3EC"
  status-orange-text: "#D97036"
  status-gray-bg: "#F3F4F6"
  status-gray-text: "#6B7280"
typography:
  heading:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt-signal}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-signal-hover}"
  button-secondary:
    backgroundColor: "{colors.cobalt-signal}"
    textColor: "{colors.cobalt-signal}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "#0B1D3A"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge-status:
    rounded: "{rounded.full}"
    padding: "2px 10px"
    typography: "{typography.label}"
  sidebar-nav-item-active:
    backgroundColor: "{colors.cobalt-signal}"
    textColor: "{colors.cobalt-signal}"
    rounded: "{rounded.sm}"
---

# Design System: Stocdup Admin

## Overview

**Creative North Star: "The Dispatch Desk"**

Stocdup Admin is the screen a distributor keeps open while running the business: a deep-navy command surface that stays calm and out of the way, cobalt signalling everything the eye should act on (primary actions, active nav, focus states), and amber reserved for things that genuinely need a human's attention (badges, flags, notification counts). The system is built for two overlapping jobs on one desk — an owner/manager working pricing, catalogue, and settings in longer desktop sessions, and operational staff working orders and delivery runs in short glanceable bursts, sometimes on a tablet in the warehouse. Nothing about the visual language should read as "office software vs. floor tool"; it is one system used both ways.

The interface is table-and-card dense by necessity — orders, products, customers, delivery runs are all lists of many similar things — so structure is carried by thin borders and a tight, consistent radius rather than by shadows or heavy chrome. Depth is used sparingly and functionally: flat at rest, shadow only when something is genuinely floating above the page (a modal, a drawer, a popover). The app shell itself doesn't scroll; only the content pane does, keeping the sidebar and top bar fixed reference points, closer to a native app than a scrolling website.

**Key Characteristics:**
- Fixed app shell (non-scrolling sidebar + top bar) with a single scrolling content pane — reads as an operational tool, not a marketing-adjacent web page.
- One workhorse radius (6px) used almost everywhere; only cards/panels step up to 8px, and pills/avatars/dots go full-round.
- Flat-by-default surfaces; shadow is exclusively an "I am floating above the page" signal (modals, drawers, popovers, dropdown menus).
- Cobalt is the only color used for interactive/active signaling; amber never competes with it for that role — amber means "notice this," cobalt means "act on this."
- Status/attention language (badges, missed-delivery flags, sync-needed counts) is a distinct semantic palette, deliberately separate from the three brand colors.

## Colors

A three-color brand system (Deep Navy, Cobalt Signal, Amber Flag) laid over near-white/pale-stone neutrals, plus a separate semantic status palette for badges and alerts.

### Primary
- **Cobalt Signal** (`#1565FF`, `hsl(220 100% 54%)`): the single interactive color — primary buttons, active nav item, links, focus rings, active filter chips. Darkens to `#0F52D6` (`hsl(220 100% 46%)`) on hover/press. Never used decoratively; its appearance always means "you can act here" or "this is currently selected."

### Secondary
- **Amber Flag** (`#F2864D`, `hsl(21 86% 63%)`): the accent reserved for things that need a human's attention rather than an action — the underline bar beneath page headings, unread-count badges, "needs attention" indicators (e.g. accounting sync). Deep Navy (`#0B1D3A`) is used as the text color on amber fills, never white, for sufficient contrast.

### Neutral
- **Deep Navy** (`#0B1D3A`, `hsl(217 68% 14%)`): primary text color and the sidebar's background — doing double duty as both "ink" and "structure," which is why the sidebar reads as a distinct navy panel rather than a themed strip.
- **Pale Stone** (`#F2F4F7`, `hsl(216 24% 96%)`): the canvas/page background behind all content.
- **Warm Off White** (`#FAFBFC`, `hsl(210 25% 98%)`): the top bar's background — very slightly warmer/lighter than canvas so the fixed chrome reads as a hairline-separated layer, not a floating card.
- **Card White** (`#FFFFFF`): every card, table, panel, and input surface.
- **Light Blue-Grey** (`#E6ECF2`, `hsl(210 32% 93%)`): the one border color used everywhere — table rows, card outlines, dividers, input strokes.
- **Slate Blue** (`#5B6B7F`, `hsl(213 17% 43%)`): secondary/muted text — field hints, timestamps, empty-state copy, inactive nav labels.

### Status Palette (semantic, not brand)
A separate six-tone set used only for `StatusBadge` and similar attention/state indicators — pale fill + saturated text, never brand cobalt or amber:
- **Green** (bg `#DCFCE7` / text `#15803D`): positive/complete states.
- **Yellow** (bg `#FEF9C3` / text `#A16207`): pending/in-progress states.
- **Red** (bg `#FEE2E2` / text `#B91C1C`): failed/blocked/missed states.
- **Blue** (bg `#DBEAFE` / text `#1D4ED8`): informational states, distinct from Cobalt Signal so it never reads as "clickable."
- **Orange** (bg `#FEF3EC` / text `#D97036`): a softer warning tier, visually adjacent to but distinct from Amber Flag.
- **Gray** (bg `#F3F4F6` / text `#6B7280`): neutral/inactive states.

### Named Rules
**The One Signal Rule.** Cobalt Signal is the only color that ever means "interactive." Amber, status tones, and every other color in the system are informational only — if it's clickable, it's cobalt (or becomes cobalt on hover/focus); if it's just informative, it is never cobalt.

## Typography

**Body & Display Font:** Inter (with `system-ui, sans-serif` fallback), weights 400/500/600 only.

**Character:** A single typeface used at three weights and a narrow size range — the hierarchy is built from weight, size, and color (muted vs. text), not from a second typeface. This keeps dense list/table screens calm; nothing competes with the data.

### Hierarchy
- **Heading** (600, 20px `text-xl` / 18px `text-lg` for secondary headings, 1.3 line-height): page titles, paired with the amber underline bar (see Components → Page Heading).
- **Section Title** (600, 14px `text-sm`): card/panel headers (e.g. `FormCard` title), settings tab labels.
- **Body** (400, 14px `text-sm`): table cell content, form values, general copy.
- **Label** (500, 12px `text-xs`, occasional `uppercase tracking-wide`): stat-tile labels, field labels, badge text — the uppercase-tracked treatment is reserved for stat tile labels specifically, not used generally.
- **Micro** (500/600, 11px): notification timestamps, small count badges — the smallest step, used only where space is genuinely tight.

### Named Rules
**The No-Second-Typeface Rule.** Every weight of hierarchy is Inter. A second typeface would read as decoration in a tool built for fast scanning, not as an upgrade.

## Layout

A fixed, non-scrolling app shell: `html`/`body` are locked to `100dvh` with `overflow: hidden`, and only the main content pane scrolls (`overflow-y-auto`) — this is deliberate (see Overview) and should not be "fixed" by making the whole page scroll.

- **Sidebar**: fixed 220px width (`--sidebar-width`) on large screens (`lg:` and up, static/always visible); below that breakpoint it becomes a slide-over drawer (`translate-x-full` ↔ `translate-x-0`, 200ms ease-in-out) with a `bg-black/40` backdrop, triggered by the top bar's hamburger.
- **Top bar**: fixed 56px height (`--topbar-height`) across all breakpoints, holds the mobile menu trigger, notification bell, and user identity.
- **Content pane**: `p-6` (24px) padding on all sides, scrolls independently of the shell.
- **Density**: table/card padding runs tighter than the shell padding — `p-4`/`p-5` (16–20px) for cards and stat tiles, `p-2.5` (10px) for the delivery-run board's compact drag cards — so board/list views can show more rows without feeling cramped relative to their container.
- **Responsive posture**: the breakpoint that matters is `lg` (sidebar collapse). Below it, list views generally have a card-based mobile layout (`MobileCardList`/`MobileCardField`) rather than a horizontally-scrolled table — tables are a desktop/tablet-width pattern, not force-fit to phone width.

## Elevation & Depth

Flat by default, hybrid only for floating layers. The overwhelming majority of surfaces — cards, tables, form panels, the delivery board's cards — sit at rest with a 1px `border-border` outline and no shadow at all. Shadow (`shadow-sm` through `shadow-2xl`) appears exclusively on things that are genuinely floating above the page's normal flow: modals, drawers, the notification dropdown, filter popovers, the drag-overlay copy of a delivery card while it's being dragged. Depth is therefore a state signal ("this is temporarily above everything else"), not a decorative default.

### Shadow Vocabulary
- **Resting card** (no shadow, `border border-border`): the default for cards, tables, panels, and stat tiles.
- **Drag card** (`shadow-sm`): the one exception — an at-rest delivery card in the board carries a very light shadow to read as a discrete, liftable object even before it's being dragged.
- **Floating panel** (`shadow-lg`): notification dropdown, filter popovers, context menus.
- **Modal / Drawer** (`shadow-2xl`): the highest tier, reserved for the two fully-overlay surfaces in the app.

### Named Rules
**The Floating-Only Rule.** If it doesn't leave the document's normal stacking context (nothing moved it above other content), it doesn't get a shadow. Borders carry structure; shadows carry "this is temporarily on top."

## Shapes

One workhorse radius carries almost the entire system: `rounded-md` (6px) on buttons, inputs, filter chips, small icon buttons, and the delivery board's cards. Cards, panels, and the notification/filter dropdowns step up one notch to `rounded-lg` (8px) — just enough to distinguish "container" from "control." Avatars, status dots, badge pills, and the notification unread-count bubble are `rounded-full`. Borders are always 1px, always `border-border` (`#E6ECF2`), and are the primary structural device — there is no unbordered card anywhere in the system.

### Named Rules
**The Two-Radius Rule.** Controls and small elements use 6px; containers use 8px. Nothing in between, and nothing sharper — nowhere in this app should a rectangle have a 0px or 2px corner.

## Components

Buttons, cards, and inputs are confident and tactile: solid cobalt fills (not outline/ghost as the default primary treatment), a visible focus ring, and a consistent 6px corner that reads as deliberate rather than default-browser.

### Buttons
- **Shape:** `rounded-md` (6px).
- **Primary:** solid Cobalt Signal fill, white text, `px-4 py-2` (16px/8px), `text-sm font-medium`. Hover uses `hover:opacity-90` rather than a separate hover color for most buttons; the dedicated `--color-primary-hover` token exists for contexts (like nav) that need a true color shift instead.
- **Secondary / Important** (signature tier — carries meaning, not decoration): a cobalt-tinted outline — `border-primary/30 bg-primary/5 text-primary`, `hover:bg-primary/10`. Reserved for an action that matters (a gateway step, a filter/toggle that's currently engaged) but isn't the screen's single primary CTA. Consistent with the One Signal Rule: it still reads as cobalt because it's still interactive, just at lower visual weight than a solid fill. Do not use this tier for routine/neutral actions (Cancel, dismiss, generic secondary) — those stay on the plain neutral treatment below.
- **Neutral:** `border-border text-text`, `hover:bg-border/20`. The default for Cancel/dismiss and any action with no elevated importance.
- **Disabled:** `opacity-50` + `cursor-not-allowed`, applied uniformly rather than a separate disabled palette.
- **Icon buttons** (menu trigger, notification bell, close): unfilled, `text-muted` at rest, `hover:text-text`, no border — sit directly on the top bar/sidebar background.

### Cards / Containers
- **Corner Style:** `rounded-lg` (8px).
- **Background:** white (`bg-white`), always against the pale-stone canvas or white-adjacent top bar.
- **Border:** always present, `border border-border`, doing the work shadows would do in a more decorative system.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Internal Padding:** `p-4`–`p-5` (16–20px) for content; card headers (when present) use `px-5 py-3.5` with a `border-b` divider before the body.

### Tables / Lists (signature component)
`ListTableShell` wraps every list view: `rounded-lg border border-border bg-white overflow-hidden` — the `overflow-hidden` is what lets the header row's background/border sit flush with the rounded corners. Below `lg`, the same data renders as a `MobileCardList` of individual bordered cards instead of a scrolled table, per the responsive posture in Layout.

### Status Badges (signature component)
`StatusBadge`: `rounded-full` pill, pale-tint background, saturated text of the same hue, plus a small solid dot of the text color repeating the signal redundantly (not color-only) — `bg`/`text` pairs come from the six-tone status palette in Colors, never from the three brand colors.

### Page Heading (signature component)
`PageHeading`: the page title in Cobalt Signal (not Deep Navy — the one place a heading itself is colored) sits directly above a full-width `h-1 rounded-full bg-accent` bar. The amber bar is a fixed visual signature for "you are here" at the top of every screen; it does not appear anywhere else in the system.

### Inputs / Fields
- **Style:** `rounded-md`, `border border-border`, white background, `px-3 py-2`, `text-sm`.
- **Focus:** border shifts to Cobalt Signal plus a 1px cobalt ring (`focus:border-primary focus:ring-1 focus:ring-primary`) — no glow/shadow, a hard-edged focus indicator consistent with the flat-by-default philosophy.
- **Disabled:** `opacity-50` + `cursor-not-allowed`, matching buttons.

### Navigation (signature component)
The sidebar is the one place Deep Navy is a background rather than text: `bg-sidebar-bg` with near-white (`sidebar-fg`) labels at 70% opacity at rest. The active item gets a `bg-sidebar-accent/20` cobalt-tinted pill plus full-opacity cobalt text and icon — not a border or underline, a filled state. A small cobalt dot marks the active item at the trailing edge unless a numeric attention badge (amber-toned) is present instead, in which case the badge takes that slot. Below `lg`, the same sidebar becomes a slide-over drawer over a dark backdrop rather than a redesigned mobile nav.

### Delivery Board Card (signature component)
The drag-and-drop delivery run card (`DeliveryCard`) is the system's densest component: `rounded-md`, `p-2.5`, `shadow-sm` (the one at-rest shadow exception, see Elevation), with a cobalt-tinted circular stop-number badge, a distinct "missed" visual treatment for attention states, and a bordered action strip (`border-t pt-2`) rather than a separate footer container — actions live inside the same card, divided by a hairline rather than nested in another surface.

## Do's and Don'ts

### Do:
- **Do** keep Cobalt Signal exclusive to interactive/active meaning (The One Signal Rule) — a cobalt-colored element that isn't clickable or currently active/selected is a bug in the system, not a style choice.
- **Do** use the Secondary/Important cobalt-outline tier (`border-primary/30 bg-primary/5 text-primary`) for a gateway or elevated action that isn't the screen's single primary CTA — not the plain neutral treatment, which reads as equal-weight with Cancel.
- **Do** use `rounded-md` (6px) for controls and `rounded-lg` (8px) for containers, and nothing else outside `rounded-full` for pills/avatars/dots (The Two-Radius Rule).
- **Do** reach for a border before a shadow; reserve shadow strictly for content that has left the normal document flow (The Floating-Only Rule).
- **Do** pair every status badge's color with the redundant solid-dot marker, not color alone.
- **Do** build hierarchy from Inter's weight/size/color rather than introducing a second typeface (The No-Second-Typeface Rule).

### Don't:
- **Don't** use Amber Flag for anything clickable — it means "notice," never "act."
- **Don't** add a resting shadow to a card, table, or panel; if it needs to stand out, that's a border or background job, not a shadow job.
- **Don't** introduce a new corner radius value; every rectangle in this system is 6px, 8px, or fully round.
- **Don't** make the page body scroll — the app shell is fixed by design; scope any new scroll region to its own container.
- **Don't** borrow a status-palette color (green/yellow/red/blue/orange/gray) for a brand/interactive purpose, or vice versa — the two palettes are semantically separate even where hues are visually close (Amber Flag vs. status Orange).
