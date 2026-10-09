# Stocdup — Brand Identity

Both frontend apps carry documented design systems, derived from the shipped UI via the
Impeccable workflow:

- Admin console — [`apps/admin/DESIGN.md`](../apps/admin/DESIGN.md) — North Star: **"The Dispatch Desk"**
- Trade-customer portal — [`apps/portal/DESIGN.md`](../apps/portal/DESIGN.md) — North Star: **"The Trade Counter"**

They share a common brand core and diverge deliberately in personality.

---

## Shared brand core

| Element | Value | Role |
|---|---|---|
| Product name | **Stocdup** | User-facing copy (internal ids stay `wholo`) |
| **Deep Navy** | `#0B1D3A` · `hsl(217 68% 14%)` | Primary text + the one dark surface (sidebar) |
| **Cobalt Blue / Signal** | `#1565FF` · `hsl(220 100% 54%)`; hover `hsl(220 100% 46%)` | The **only** "act here" colour — primary CTAs, active nav, links, focus rings |
| **Amber** | `#F2864D` · `hsl(21 86% 63%)` | Warmth / attention / status — **never** clickable |
| Pale Stone | `#F2F4F7` · `hsl(216 24% 96%)` | Page canvas |
| Light Blue-Grey | `#E6ECF2` · `hsl(210 32% 93%)` | The one border / divider token |
| Slate Blue | `#5B6B7F` · `hsl(213 17% 43%)` | Muted / secondary text |
| Warm Off-White | `#FAFBFC` · `hsl(210 25% 98%)` | Top-bar background (hairline layer above canvas) |
| Card White | `#FFFFFF` | Every card, table, panel, input surface |

### Typography
- **Inter** is the only typeface (fallback `system-ui, sans-serif`).
- Hierarchy is built from size, weight, and letter-spacing / colour — never a second family, never a serif accent.
- Weights 400 / 500 / 600 (portal adds 700 for the wordmark only).

### Depth
- Flat by default: surfaces sit at rest with a 1px border and no shadow.
- Shadow is a **state signal** — "this is temporarily floating above the page" (modals, drawers, popovers, hover-lift) — never decoration.

### Named rules (shared intent)
- **Cobalt = the single next action.** If more than one thing on screen is Cobalt, something is competing with the real CTA. ("The One Signal Rule" / "The Confident Blue Rule".)
- **Amber = "notice this", never "act".** It marks state and attention; it never doubles as a clickable colour. ("The Warm Spark Rule".)
- **No second typeface.** ("The No-Second-Typeface Rule" / "The One Typeface Rule".)

---

## Admin — "The Dispatch Desk"

The screen a distributor keeps open while running the business: a deep-navy command
surface that stays calm and out of the way, cobalt signalling everything the eye should
act on, amber reserved for things that genuinely need a human's attention. One system
used two ways — an owner working pricing/catalogue/settings in long desktop sessions,
and operational staff working orders and delivery runs in short glanceable bursts.

**Key characteristics**
- Fixed, non-scrolling app shell — `html`/`body` locked to `100dvh` / `overflow: hidden`; only the content pane scrolls. Reads as an operational tool, not a web page.
- Sidebar fixed 220px on `lg`+, slide-over drawer below. Top bar fixed 56px.
- **Two-Radius Rule:** `rounded-md` (6px) for controls, `rounded-lg` (8px) for containers, `rounded-full` for pills / avatars / dots. Nothing else, nothing sharper.
- **Floating-Only Rule:** borders carry structure; shadow appears exclusively on surfaces that have left the document flow (`shadow-sm` drag card → `shadow-lg` popovers → `shadow-2xl` modals/drawers).

**Status palette (semantic, separate from brand)** — pale fill + saturated text, always paired with a redundant solid dot:

| Tone | Background | Text | Meaning |
|---|---|---|---|
| Green | `#DCFCE7` | `#15803D` | positive / complete |
| Yellow | `#FEF9C3` | `#A16207` | pending / in-progress |
| Red | `#FEE2E2` | `#B91C1C` | failed / blocked / missed |
| Blue | `#DBEAFE` | `#1D4ED8` | informational (distinct from Cobalt so it never reads as clickable) |
| Orange | `#FEF3EC` | `#D97036` | softer warning tier |
| Gray | `#F3F4F6` | `#6B7280` | neutral / inactive |

**Signature components**
- **PageHeading** — title in Cobalt (the one place a heading is coloured) above a full-width `h-1 rounded-full` amber bar. The amber bar means "you are here" and appears nowhere else.
- **StatusBadge** — `rounded-full` pill, pale tint + saturated text + redundant dot, drawn only from the status palette.
- **ListTableShell** — `rounded-lg border bg-white overflow-hidden` wraps every list; collapses to `MobileCardList` below `lg`.
- **Sidebar nav** — active item = cobalt-tinted filled pill + full-opacity cobalt text/icon + trailing cobalt dot (or amber count badge).
- **DeliveryCard** — the densest component: `rounded-md`, `p-2.5`, `shadow-sm` (the one at-rest shadow exception), cobalt stop-number badge, hairline-divided action strip.

**Type scale:** Heading 600/20px · Section Title 600/14px · Body 400/14px · Label 500/12px (uppercase-tracked only on stat-tile labels) · Micro 500–600/11px.

---

## Portal — "The Trade Counter"

Should feel like walking up to a supplier who already knows you — quick, personal,
confident, not a form to fill out. The venues who use it first (cafes, delis, pubs,
hotels) are not warehouse operators: fresh, warm, curated, and lively while staying
unmistakably a serious trade tool, not a consumer storefront.

Confirmed rejections: nothing industrial or dispatch-board-utilitarian, nothing softly
rounded and retail-cute, no decorative illustration or whimsy, no ambient shadow.

**Key characteristics**
- Unapologetically flat and square: white canvas, hairline borders, generous 20px (`p-5`) padding.
- **Square Edge, Circular Identity Rule:** every rectangular surface is a hard **0px** corner (`tailwind.config.ts` zeroes the whole `rounded-*` scale). The only curves are true circles — avatars, distributor logos, status dots, spinners, round icon controls. A curve always means "person / mark / status / motion".
- **The Reach Rule:** resting cards carry at most a whisper (`shadow-sm`) + hairline border; hover lifts a clickable card to `shadow-md` + Cobalt border; dropdowns/modals get real layered shadow.
- Structural pivot is the `md` breakpoint (768px). Desktop sidebar resizes 256px ↔ 64px over 300ms, state in `localStorage`; mobile = 80%-width off-canvas dark drawer triggered from a **light** top bar (the two-tone contrast is deliberate).
- `PageShell` owns four width modes chosen by page intent: **narrow** 480px (checkout / order / product detail), **full** (top-level content pages, edge-to-edge), **reading** 768px and **wide** 896px (prose, currently unused).

**Extra colours (portal only)**
| Token | Value | Role |
|---|---|---|
| Cobalt tints | `hsl(220 100% 95%)` / `hsl(220 60% 97%)` | selected / hover backgrounds |
| Amber tints | `hsl(21 90% 95%)` / `hsl(21 70% 85%)` | status badge / callout backgrounds & borders |
| **Sky Blue** | `hsl(215 90% 70%)` · `#6EA8F7` | decorative / secondary highlight only — non-interactive |
| Success Green | `#16A34A` | semantic (plain literal, not a token) |
| Error Red | `#DC2626` | semantic (plain literal, not a token) |
| Near White | `hsl(0 0% 95%)` | sidebar text on the navy shell |

**Signature components**
- **Wordmark** — login screen's "stocd**up**" lockup: Display 700/34px, letter-spacing −0.03em, "up" in Cobalt against Deep Navy.
- **Status pill** — `rounded-full`, colour dot + 12px medium label; pending `#fef9c3`/`#a16207`, suspended `#fee2e2`/`#b91c1c`. No badge at all = the "all good" signal.
- **Cards** — hard 0px, Surface White, `shadow-sm` → `shadow-md` + Cobalt border on hover (150ms), `p-5`; locked state 40% opacity + lock icon.
- **Round icon stepper** — 30×30px true circle, 1.5px border; the one place a button is intentionally circular.
- **Distributor chrome** — 56px header (`sticky top-0`) + tab bar (`sticky top-14`) stack and stay visible while content scrolls.

**Type scale:** Display 700/34px (wordmark only) · Headline 600/24px · Title 600/16px · Body 400–500/14px (500 wherever text is interactive/scannable) · Label 500/12px (+ a 10–11px `tracking-widest` uppercase micro-variant).

---

## Known drift (portal `DESIGN.md` flags these as debt, not a second language)

- **Tailwind class names don't match colours:** `accent-*` utilities render **Cobalt** (`--color-primary`); `amber-*` utilities render the **orange** accent (`--color-accent`). `bg-accent` is Cobalt, not Amber. Always check `tailwind.config.ts` / `theme.css`.
- A few older screens (accept-invite, order list / detail) drifted to 2–4px radii and hardcoded hex greys (`#E5E7EB`, `#9CA3AF`, …). New work uses the semantic tokens (`border`, `muted`, `foreground*`) even where neighbouring code doesn't yet.
