---
name: Stocdup Portal
description: Trade-customer ordering portal — fresh, warm, curated B2B commerce for venues like cafes, delis, pubs, and hotels.
colors:
  deep-navy: "hsl(217 68% 14%)"
  cobalt-blue: "hsl(220 100% 54%)"
  cobalt-blue-hover: "hsl(220 100% 46%)"
  cobalt-blue-light: "hsl(220 100% 95%)"
  cobalt-blue-subtle: "hsl(220 60% 97%)"
  amber: "hsl(21 86% 63%)"
  amber-light: "hsl(21 90% 95%)"
  amber-border: "hsl(21 70% 85%)"
  sky-blue: "hsl(215 90% 70%)"
  sky-blue-light: "hsl(215 90% 96%)"
  pale-stone: "hsl(216 24% 96%)"
  light-blue-grey: "hsl(210 32% 93%)"
  slate-blue: "hsl(213 17% 43%)"
  warm-off-white: "hsl(210 25% 98%)"
  surface-white: "hsl(0 0% 100%)"
  near-white: "hsl(0 0% 95%)"
  success-green: "#16A34A"
  error-red: "#DC2626"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
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
  eyebrow:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    textTransform: "uppercase"
    letterSpacing: "0.14em"
rounded:
  none: "0px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt-blue}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-blue-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card-distributor:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.lg}"
    padding: "20px"
  eyebrow:
    dashColor: "{colors.amber}"
    textColor: "{colors.slate-blue}"
  badge-status-pending:
    backgroundColor: "#fef9c3"
    textColor: "#a16207"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  input-search:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.md}"
    padding: "10px 16px 10px 40px"
---

# Design System: Stocdup Portal

## Overview

**Creative North Star: "The Trade Counter"**

Stocdup Portal should feel like walking up to a supplier who already knows you — quick, personal, and confident, not a form to fill out. The venues who use it first (cafes, delis, pubs, hotels) are not warehouse operators; the system reads as fresh, warm, curated, and lively while staying unmistakably a serious trade tool, not a consumer storefront. Deep Navy grounds the interface with quiet authority, Cobalt Blue is the one color that says "act here," and Amber supplies the warm, lively spark — status, attention, personality — without ever competing with Cobalt for the primary action.

The system is flat and calm, with **soft corners borrowed from the marketing site (`www.stocdup.com`)**: 6px on controls (buttons, inputs, tabs, selectable cards) and 8px on containers (cards, panels, popovers, modals). True circles are still reserved entirely for identity — avatars, distributor logo marks, status dots, spinners, and the round ± stepper — so a full circle always means "this is a person, a mark, a status, or motion," never decoration. Depth is used sparingly and functionally: surfaces sit flat until something is genuinely floating toward the user (a hovered card, an open dropdown, a modal); it is never sprinkled on for atmosphere. Confirmed rejections: nothing industrial or dispatch-board-utilitarian, nothing retail-cute or bubbly (the radius is restrained, not playful), no decorative illustration or whimsy, no ambient shadow scattered across resting surfaces.

**Key Characteristics:**
- Confident, warm, curated — a trade tool a venue owner would trust and enjoy using
- One typeface (Inter), hierarchy from size/weight/letter-spacing only
- Soft corners: 6px on controls, 8px on containers; true circles stay identity-only
- Section headers carry an **amber eyebrow kicker** (dash + uppercase tracked label)
- Flat by default; shadow only appears as a "lifting toward you" cue
- Cobalt Blue is rationed to the single next action; Amber carries warmth and status

## Colors

Grounded, confident neutrals (Deep Navy, Pale Stone, white) carry the page; Cobalt Blue is spent on exactly one thing at a time; Amber supplies warmth and status without ever being mistaken for the primary action.

### Primary
- **Cobalt Blue** (`hsl(220 100% 54%)` / #1565FF): the one color that means "act here" — primary CTAs, the active sidebar item (its left border + tint, not the label), the active tab underline, focus rings, cart-count badge. Also used at 46% lightness (`hsl(220 100% 46%)`) for hover/pressed states, and as 95%/97%-lightness tints (`cobalt-blue-light`, `cobalt-blue-subtle`) for selected/hover backgrounds.

### Secondary
- **Amber** (`hsl(21 86% 63%)` / #F2864D): warmth and attention — the eyebrow-kicker dash, the minimum-order progress bar fill, pending/status accents. Never used for a primary action or a navigation state; it marks attention, Cobalt marks action. Tints at 95%/85% lightness (`amber-light`, `amber-border`) back status badges, the below-minimum callout panel, and the eyebrow.

### Tertiary
- **Sky Blue** (`hsl(215 90% 70%)` / #6EA8F7): decorative/secondary highlight only — non-interactive. Used with its 96%-lightness tint (`sky-blue-light`) for subtle highlighted card backgrounds (e.g. the user-menu identity panel).

### Neutral
- **Deep Navy** (`hsl(217 68% 14%)` / #0B1D3A): primary text color, and — doing double duty — the dark shell of the two deliberately dark surfaces in an otherwise light system: the desktop/mobile sidebar, and the account-home merchandising banner. Light text on navy uses the `on-navy` (white) / `on-navy-muted` (`#AEBAD0` blue-grey) tokens, mirroring the marketing site.
- **Slate Blue** (`hsl(213 17% 43%)` / #5B6B7F): muted/secondary text, and the eyebrow-kicker label.
- **Pale Stone** (`hsl(216 24% 96%)` / #F2F4F7): page canvas background.
- **Light Blue Grey** (`hsl(210 32% 93%)` / #E6ECF2): the canonical border/divider token.
- **Warm Off White** (`hsl(210 25% 98%)` / #FAFBFC): topbar background, distinct from pure white surfaces.
- **Surface White** (`hsl(0 0% 100%)`): card/panel/modal surfaces.
- **Near White** (`hsl(0 0% 95%)`): sidebar text on the Deep Navy shell.
- Semantic: **Success Green** (#16A34A), **Error Red** (#DC2626) — plain literals, not theme-file tokens.

### Named Rules
**The Confident Blue Rule.** Cobalt Blue is reserved for the single next thing the user should do — primary CTA, active nav item, active tab, focus ring. If more than one element on screen is Cobalt, something is competing with the actual call to action. (The distributor About-us tagline is a deliberate, non-interactive exception — brand voice, not an action.)

**The Warm Spark Rule.** Amber marks status and attention (the eyebrow kicker, progress, pending, "look here") — it never doubles as a clickable primary action's color, and it never marks a navigation state (active nav/tab is Cobalt).

**Read the token names, not the class names.** `tailwind.config.ts` maps the Tailwind `accent-*` utility family to the `--color-primary` CSS variable (Cobalt Blue) and the `amber-*` utility family to `--color-accent` (the orange/Amber token). `bg-accent` in this codebase is Cobalt Blue, not Amber; `bg-amber` is the actual orange. Confirm the mapping in `tailwind.config.ts`/`theme.css` before assuming a class's color from its name.

## Typography

**Body/UI Font:** Inter (with system-ui, sans-serif fallback) — the only typeface in the system.

**Character:** Confident and legible at small sizes, since most UI text runs 12–16px on mobile. Weight and letter-spacing do the work of hierarchy; there is no second family for contrast.

### Hierarchy
- **Display** (800, 34px, line-height 1, letter-spacing -0.045em): the wordmark lockup only — e.g. the login screen's "stocd**up**" mark, where "up" is set in Cobalt Blue. Weight and tracking match `apps/www`'s `Wordmark.tsx` (`font-extrabold tracking-[-0.045em]`); the portal's Google-Fonts Inter tops out at 700, so 800 renders as 700 until the font is aligned with www's self-hosted InterVariable.
- **Headline** (600, 24px): page-level greetings and top-level headers (e.g. "Hi, {name}").
- **Title** (600, 16px): section headers, the distributor name in the header bar, modal titles. Section headers keep this size — the eyebrow kicker above them supplies the lift, not a larger heading.
- **Body** (400–500, 14px): primary UI copy — nav labels, buttons, list rows, form values. 500-weight ("medium") is used wherever text is interactive or being scanned as a label; plain 400 for secondary read-only copy (emails, phone numbers, timestamps).
- **Label** (500, 12px, letter-spacing 0.02em): meta text, SKUs, tab labels. A smaller 10–11px uppercase variant with wide tracking (`tracking-widest`) marks micro-labels like "Signed in as" and the checkout section captions.
- **Eyebrow** (700, 12px, uppercase, letter-spacing 0.14em, Slate Blue): the section kicker label — see below.

### Named Rules
**The One Typeface Rule.** Inter is the only typeface. Hierarchy comes from size, weight, and letter-spacing — never a second family, never a serif accent.

## Section kickers (Eyebrow)

Borrowed from the marketing site: a **short amber dash** (`h-1 w-[22px] rounded-full bg-amber`) followed by an uppercase, wide-tracked label in Slate Blue. Rendered by the shared `<Eyebrow>` component and placed directly above a section's `Title` heading (`mb-2`).

- **Purpose:** it gives a section a confident "chapter marker" without inflating the heading size or reaching for a second colour on the heading itself.
- **Where:** the home greeting + its two section headers, the catalogue, and the distributor About-us box. Used **selectively** — not every list or sub-panel gets one.
- **Amber here means "notice this", never a link.** The dash is `aria-hidden`.

## Layout

`PageShell` is the single page-container primitive and it owns the page gutter — **every** top-level distributor page (home, catalogue, product detail, orders list, order detail, checkout, settings) renders its content as `<PageShell width="full">` and nothing else: no `padding="none"`, no hand-rolled `px-*` / `pb-*` gutters, no inner `mx-auto max-w-*` cap, no full-bleed `bg-canvas` band. The shell gives a uniform 20px (`p-5`) gutter on all four sides and lets the content fill the width beside the sidebar; each page manages only its own internal grid. The white `<main>` is the canvas throughout — cards are white `rounded-lg border` surfaces on white, separated by the hairline border, never floated on a Pale Stone field. `PageShell`'s other width modes — **narrow** (480px), **reading** (768px), **wide** (896px) — are centred columns kept for narrow forms / prose pages; `padding="none"` survives only for the `center` loading and error states.

**Checkout** is the exception to the narrow shell. On mobile it is a single-column flow; at `md` and above it becomes a two-column grid — a left column (line items, PO / notes, delivery address) and a `md:sticky` right rail (order summary with the minimum-order line, delivery-day picker, Place Order + the quiet secondary actions). Both columns render as `rounded-lg` bordered surfaces on desktop. The shared `DistributorPageHeader` is suppressed on `/checkout` because the rail already carries the delivery-cutoff and minimum-order context.

**The account home (`/`, "Our Suppliers")** is the other two-column page. `md` and above: a fixed ~420px **left** column — greeting, then the eyebrow-only "Your suppliers" section (a vertical stack of full-width `DistributorCard` rows, each with a trailing chevron and the big right-aligned order count; a dashed "empty slot" cue when the customer has only 1–3 suppliers; then an inert "Find new suppliers" card) — and a fluid **right** column for discovery (a prominent but non-functional "Search products or suppliers" bar, a Deep-Navy merchandising banner — condensed uppercase headline with an amber highlight box (`bg-amber` fill / navy `amber-fg` text, like the marketing site's `<Mark>`), `on-navy-muted` subcopy, one Cobalt CTA that isn't wired yet — and the `RecommendedSuppliers` example carousel). Mobile collapses to one column via the same `contents` / `order-*` pattern as checkout, ordered greeting → suppliers → search → merch band → recommended. The discovery surfaces are placeholders until a marketplace directory exists.

The structural mobile/desktop pivot is the `md` breakpoint (768px) throughout — not `sm`/`lg`, which are reserved for finer adjustments like the catalogue's column count (1-column row list on mobile → 2/3/4-column grid at `sm`/`lg`/`xl`). Below `md`, the authenticated shell is a fixed light-colored top bar (56px / `h-14`) plus an off-canvas dark sidebar (80% viewport width, slides in via `translate-x` over 300ms). At `md` and above, the sidebar becomes a persistent static column that smoothly resizes between 256px (`w-64`, expanded) and 64px (`w-16`, collapsed) over 300ms, with state remembered in `localStorage`.

Within a distributor's context, chrome stacks vertically and stays sticky: a 56px distributor header (`sticky top-0`), then a tab bar (`sticky top-14`) sitting directly beneath it — so both remain visible while the page content scrolls underneath.

## Elevation & Depth

The system is flat by default and treats shadow as a functional signal, not atmosphere. Resting cards carry only the barest shadow (`shadow-sm`, effectively a whisper) paired with a 1px hairline border as the real separator. Shadow becomes a meaningful cue only when something is actually lifting toward the user: a hovered, clickable card jumps to `shadow-md`, tints its border Cobalt, and rises with `-translate-y-1` (matching the marketing site's card lift); anything genuinely floating above the page — a dropdown menu or a modal — gets a real, layered shadow.

### Shadow Vocabulary
- **Resting card** (`shadow-sm`, Tailwind default ≈ `0 1px 2px rgba(0,0,0,0.05)`): paired with a 1px border; barely visible, not a depth cue on its own.
- **Hovered/lifted card** (`shadow-md` + `-translate-y-1`): the actual "this is interactive, and you're about to act" signal, paired with the border shifting to Cobalt. `motion-reduce` drops the translate.
- **Modal** (`shadow-xl`, Tailwind default): the confirmation modal's floating panel.
- **Dropdown/menu** (custom two-layer: `0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)` + `ring-1 ring-black/5`): the user-menu popover — heavier than a card lift because it floats fully above the page, not just above its siblings.
- **Identity accent** (`0 2px 8px rgba(0,0,0,0.15)`): the home banner's logo circle.

### Named Rules
**The Reach Rule.** Surfaces are flat at rest — separated by a hairline border, not a shadow. A shadow only appears when something is genuinely lifting toward the user (hover) or floating above the page (dropdown, modal). Shadow is never decorative.

## Shapes

Corners are soft but restrained, aligned with `www.stocdup.com`:

- **Controls — 6px (`rounded-md`):** buttons, text inputs and the search field, the quantity-stepper number field, tabs, and selectable cards (the checkout delivery-day options).
- **Containers — 8px (`rounded-lg`):** cards and panels (supplier cards, the distributor info boxes, the checkout columns), the user-menu popover, confirmation modals.
- **Circular identity (`rounded-full`):** avatars and distributor logo marks, small status dots, loading spinners, and the round ± quantity-stepper buttons. A full circle always *means* something — a person, a mark, a status, motion.
- **Square (`rounded-none`, 0px):** kept only for genuinely full-bleed edges (a banner, an image that runs to the container edge). It is retained in the scale but is no longer the default.

`tailwind.config.ts` defines the whole scale (`sm: 4px`, `DEFAULT`/`md: 6px`, `lg`/`xl: 8px`, `2xl: 12px`, `3xl: 16px`); `full` is the Tailwind default. Borders (1px hairlines) remain the system's primary way of separating surfaces — radius and shadow are secondary.

### Named Rules
**The Soft Edge, Circular Identity Rule.** Rectangles get a small, consistent radius (6px control / 8px container) — never a large playful one, never a per-component one-off. A *full* circle is reserved for identity, status, and motion. `rounded-none` is only for a deliberate full-bleed edge.

## Components

### Buttons
Use the shared `<Button>` component (`variant="primary" | "secondary" | "ghost"`, `fullWidth`).
- **Shape:** 6px corners (`rounded-md`).
- **Primary:** Cobalt Blue background, white text, `10px 16px` padding (`px-4 py-2.5`); hover darkens to `cobalt-blue-hover`; disabled drops to 60% opacity.
- **Secondary/Outline:** white background, 1px border in the border token, foreground text; hover fills with `surface-hover`.
- **Ghost / menu item:** no border or fill at rest; hover fills with a light neutral tint; text runs `foreground-secondary` → `foreground` on hover.
- **Icon-only / round stepper:** 30×30px true circle, 1.5px border, transparent background; hover shifts border and icon color to Cobalt; active fills with the `cobalt-blue-subtle` tint; disabled drops to 40% opacity. The one place a button is intentionally circular — it does **not** use `<Button>`.

### Badges (status pill)
- **Style:** full-circle-radius pill (`rounded-full`), small color dot + label, 12px medium text.
- **Tone:** pastel background paired with a saturated text color per semantic status — pending (`#fef9c3` / `#a16207`), suspended (`#fee2e2` / `#b91c1c`). No relationship/active state renders a badge at all — absence of a badge is itself the "all good" signal.

### Cards
- **Corner style:** 8px (`rounded-lg`).
- **Background:** Surface White.
- **Shadow strategy:** `shadow-sm` at rest → `shadow-md` + Cobalt border + `-translate-y-1` on hover (Elevation & Depth section); 150ms transition.
- **Border:** 1px in the `border` token.
- **Internal padding:** 20px (`p-5`) for the supplier card; 24px (`p-6`) for the distributor info boxes.
- **Locked/disabled state:** 40% opacity, `cursor-not-allowed`, a small lock icon top-right.

### Minimum-order progress
- Below the minimum: the bar + "add £X more" copy sit inside a soft amber panel (`rounded-lg border border-amber-border bg-amber-light/60`) at the `compact` size; the bar itself is a `rounded-full` 6px track with an Amber fill. The `prominent` (checkout rail) size keeps the copy without the panel.
- Met: a Success-green check + confirmation line, no bar.

### Inputs / Fields
- **Style:** 1px border in the border token, white background, 6px corners (`rounded-md`), `10px 16px` padding (left padding extends to ~40px when an inset icon like the search magnifier is present).
- **Focus:** a visible 2px Cobalt ring plus a Cobalt border — never relies on the browser's default outline alone.
- **Error/Disabled:** not yet established anywhere in the codebase — treat as undecided rather than inventing a pattern.

### Navigation
- **Sidebar (authenticated shell):** persistent dark Deep Navy panel on desktop, collapsible between 256px and 64px with an animated width transition; the logo strip at the top sits on Warm Off White and carries the hexagon mark + "stocd**up**" wordmark. Active item = 2px Cobalt left border + a 20%-opacity Cobalt tint background + a near-white, semibold label and icon (Cobalt text on the navy shell fails contrast) + `aria-current="page"`; inactive = 70%-opacity white text, hover = a darker navy tint. On mobile the same content becomes a full off-canvas drawer (80% width, slide transform), triggered from a separate **light** top bar — the two-tone contrast (light mobile chrome, dark drawer content) is deliberate.
- **Distributor tab bar:** light underline tabs, 3px bottom border; active = Deep Navy text + **Cobalt** underline; inactive = muted grey text; sticky directly beneath the distributor header. (Amber never marks the active tab.)

### Modal (confirmation dialogs)
- 8px corners (`rounded-lg`), Surface White, `shadow-xl`, centered over a 40%-opacity black backdrop, 24px (`p-6`) padding, stacked full-width action buttons rather than a side-by-side pair.

### Logo / wordmark
- The mark is the **hexagon** (`public/logos/stocdup-logo-only.png`, two-tone navy/cobalt; `-white` variant for dark surfaces) — the same mark used on `www.stocdup.com`, derived from `docs/branding/logo_v2.svg`. The lockup pairs it with "stocd**up**" where "up" is Cobalt, at `font-extrabold` / `-0.045em` (see Display).
- The browser favicon (`src/app/favicon.ico` + `src/app/icon.png`), the iOS icon (`src/app/apple-icon.png`) and the three PWA-manifest icons (`public/icons/icon-{192,512,maskable-512}.png`) are all the hexagon mark, regenerated from `apps/www/public/logo-mark.png`. The maskable icon has a white safe-zone background; the rest are transparent.
- Product-image placeholders paint the hexagon silhouette as a faint 10%-opacity watermark via CSS `mask-image`.

## Do's and Don'ts

### Do:
- **Do** ration Cobalt Blue to the one next action on screen — CTA, active nav item, active tab, focus ring (**The Confident Blue Rule**).
- **Do** use the `amber-*` Tailwind utilities for warmth/status accents (the eyebrow kicker, progress, pending, attention) — never for a primary action or a navigation state.
- **Do** use `rounded-md` (6px) on controls and `rounded-lg` (8px) on cards/panels/modals; keep `rounded-full` for circular identity and `rounded-none` only for a deliberate full-bleed edge (**The Soft Edge, Circular Identity Rule**).
- **Do** reach for the shared `<Button>` and `<Eyebrow>` components rather than re-deriving their classes inline.
- **Do** keep resting surfaces flat (hairline border, at most a whisper of shadow); only add real shadow when something is hovering/lifting or floating above the page (**The Reach Rule**).
- **Do** use the shared `border`, `muted`, `foreground` / `foreground-secondary` / `foreground-tertiary` Tailwind tokens for new UI, even where nearby existing code doesn't yet.

### Don't:
- **Don't** assume a class's color from its name — the Tailwind `accent-*` family renders Cobalt Blue (from `--color-primary`) while `amber-*` renders the actual orange accent (from `--color-accent`); check `tailwind.config.ts` before using either.
- **Don't** hardcode one-off hex values for borders/text/greys (`#E5E7EB`, `#9CA3AF`, `#1A1A1A`, `#4B5563`, `#6B7280`, `#D5D9E0`, `#C4B5A8`, etc.) — several existing screens do this instead of the semantic tokens; it's drift, not a second legitimate palette. New work should use the tokens even where nearby code doesn't yet.
- **Don't** invent a per-component radius. The scale is 6px control / 8px container — a 12px or 20px "friendlier" card, or a pill-shaped button, is off-system.
- **Don't** make a section heading bigger to give it weight — add the `<Eyebrow>` kicker instead, and keep the heading at the `Title` step.
- **Don't** introduce a second typeface or lean on shadow for decoration — both contradict, respectively, **The One Typeface Rule** and **The Reach Rule**.
