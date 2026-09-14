'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { heightAt } from '@/components/storefront/CoverBanner';

/**
 * The cover banner's height is a function of scroll position (`heightAt` in
 * CoverBanner.tsx) — it's read fresh off a 'scroll' listener, a tick behind
 * whatever we just set `window.scrollY` to. So even an instant jump computed
 * from the *current* (pre-jump) banner height lands wrong: by the time the
 * banner catches up to the new scroll position, its height (and so every
 * section's position below it) has changed out from under the target.
 *
 * Solve for the scroll position whose resulting banner height is
 * self-consistent with that position:
 *   finalY = rawTargetY - currentBannerHeight + heightAt(finalY)
 * finalY appears on both sides — `heightAt(finalY)` is what we're trying to
 * find `finalY` from — so this doesn't reduce to plugging in a value. Rewrite
 * it as `g(finalY) = 0` where `g(y) = y - (rawTargetY - currentBannerHeight) - heightAt(y)`.
 * `heightAt` is monotonically non-increasing in `y` (CoverBanner.tsx clamps
 * it between two endpoints), so `g` is monotonically non-decreasing and has
 * exactly one zero — bisection finds it without needing to know `heightAt`'s
 * shape (linear, eased, anything), only that it's monotonic and bounded. This
 * intentionally avoids a naive fixed-point loop (`y = offset + heightAt(y)`
 * repeated): `heightAt`'s slope can exceed 1 in magnitude within its
 * collapsing band, which would make that loop diverge instead of converge.
 * Depends on CoverBanner writing `el.style.height` directly with no CSS
 * transition — a transition would make the live height read reflect an
 * in-progress value instead of the settled one.
 */
export function correctedTargetY(rawTargetY: number): number {
  const banner = document.querySelector<HTMLElement>('.cover-banner');
  if (!banner) return rawTargetY;
  const currentBannerHeight = banner.getBoundingClientRect().height;
  const mobile = window.innerWidth < 768;

  const offset = rawTargetY - currentBannerHeight;
  const g = (y: number) => y - offset - heightAt(y, mobile);

  // heightAt is bounded (it clamps between its full/min endpoints), so a
  // sufficiently wide bracket around `offset` always contains the root; widen
  // further only as a guard against a future heightAt with a wider range,
  // capped so a broken (non-monotonic or unbounded) heightAt can't hang this.
  let lo = offset - 1000;
  let hi = offset + 1000;
  for (let guard = 0; guard < 10 && g(lo) > 0; guard++) lo -= 1000;
  for (let guard = 0; guard < 10 && g(hi) < 0; guard++) hi += 1000;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Live `--sticky-stack-h` (published by StickyShopBlock's ResizeObserver), in px. */
function stickyStackHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-stack-h')) || 0;
}

/**
 * Scroll-spy for the single-page storefront. Given the section ids in document
 * order, returns the id currently under the sticky shop block and a
 * `scrollToSection` that jumps straight to one, instantly — no scroll
 * animation (the landing offset is pure CSS — `scroll-margin-top:
 * var(--sticky-stack-h)` on the section). Manual scrolling is unaffected and
 * still drives the active section live, with the cover banner's own
 * scroll-position-driven collapse animating as usual.
 *
 * The active section is the last one (in document order) whose top has
 * scrolled up to/past `--sticky-stack-h` — the same boundary `scrollToSection`
 * targets via `scroll-margin-top`, so the two stay consistent by construction.
 * (An `IntersectionObserver`'s "is this section's top edge past the sticky
 * stack" can't be answered by `isIntersecting` alone: adjacent sections share
 * a boundary with no gap, so right after landing on one, the previous section
 * can still have a sliver of overlap and remains "intersecting" too — picking
 * the first such match by document order then keeps the *previous* section
 * active. Measuring `getBoundingClientRect().top` directly avoids that.) A
 * short last section that can't reach the top of the viewport is handled by a
 * bottom-of-page fallback.
 *
 * A click pins its target active immediately — the jump is instant, but the
 * cover banner's own height still updates a scroll-listener tick later (see
 * `correctedTargetY` below), so there's a brief window where the
 * boundary-crossing check above would otherwise read stale geometry and
 * flicker the highlight; the pin covers that gap.
 *
 * `scrollToSection` keeps re-landing (via a `ResizeObserver` on `<body>`,
 * debounced, stopping early on a genuine user scroll) while the page is still
 * visibly changing size after the jump — not just for the async, multi-second
 * settling of a fresh cross-route arrival (a `<Link href="/{slug}#about">`
 * from a sub-page like Orders can't rely on the browser's native one-shot
 * hash-scroll, which fires before Catalogue's product fetch has resolved),
 * but for same-page clicks too: landing far enough down the page to pass
 * `ShopHeader`'s sentinel flips `scrolledPast` true, revealing
 * `CondensedShopHeader` and growing `--sticky-stack-h` by its height *after*
 * the jump already used the smaller, pre-reveal value — a one-shot jump from
 * the very top of the page (banner still expanded) reliably undershoots by
 * exactly that gap without this.
 */
export function useScrollSpy(ids: string[], ready = true): [string, (id: string) => void] {
  const [activeId, setActiveId] = useState(ids[0] ?? '');
  const idsKey = ids.join('|');
  // True while a click-triggered scroll is still settling; cleared once
  // `scroll` events stop arriving (see the debounce in the effect below).
  const suppressRef = useRef(false);
  // Cancels the in-flight settle-correction loop from the previous
  // `scrollToSection` call, if any (a new click supersedes it).
  const cancelSettleRef = useRef<() => void>(() => {});

  // One-shot: compute where `id` should be right now and jump there. Called
  // both directly and repeatedly by scrollToSection's settle loop below —
  // each call re-reads live geometry, so calling it again after the page has
  // changed size naturally corrects for that change. Returns false (and does
  // nothing) if `id` isn't in the DOM, e.g. a stale id from a previous route.
  const landOn = useCallback((id: string): boolean => {
    const el = document.getElementById(id);
    if (!el) return false;
    setActiveId(id);
    suppressRef.current = true;
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);

    const marginTop = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const rawTargetY = window.scrollY + el.getBoundingClientRect().top - marginTop;
    const targetY = correctedTargetY(rawTargetY);

    window.scrollTo(0, targetY);
    return true;
  }, []);

  // Lands on `id`, then keeps re-landing while the page's height is still
  // visibly changing underneath it — e.g. ShopHeader's sentinel flips
  // `scrolledPast` once we scroll past it, revealing CondensedShopHeader and
  // growing --sticky-stack-h *after* landOn's first jump already used the
  // smaller, pre-reveal value (see the doc comment above for the full story,
  // including the cross-route hash-arrival case this also covers).
  const scrollToSection = useCallback(
    (id: string) => {
      cancelSettleRef.current(); // a new click supersedes any correction still in flight
      if (!landOn(id)) return;

      // "stop correcting" — resets on every resize. Declared before `cancel`
      // (which needs to clear it) since it's genuinely reassigned each time.
      let settleTimer: ReturnType<typeof setTimeout> | undefined;

      // References `layoutObserver`/`maxTimer` below despite being declared
      // first — safe because `cancel` is only ever invoked later (via a
      // timeout, event, or the observer callback), never synchronously during
      // this function's own execution, so both are already assigned by then.
      const cancel = () => {
        layoutObserver.disconnect();
        clearTimeout(settleTimer);
        clearTimeout(maxTimer);
        window.removeEventListener('wheel', cancel);
        window.removeEventListener('touchstart', cancel);
        cancelSettleRef.current = () => {};
      };
      // <body>'s size is a reasonable, cheap proxy for "has anything on the
      // page grown or shrunk" — we don't know in advance which element (the
      // sticky header, a section, an image) might change size next.
      const layoutObserver = new ResizeObserver(() => {
        landOn(id);
        clearTimeout(settleTimer);
        settleTimer = setTimeout(cancel, 200); // 200ms of no further resizes = settled
      });
      layoutObserver.observe(document.body);
      // A genuine user scroll/touch takes precedence over this correction —
      // don't fight someone who's already decided to scroll elsewhere.
      window.addEventListener('wheel', cancel, { once: true, passive: true });
      window.addEventListener('touchstart', cancel, { once: true, passive: true });
      // Safety net: never keep correcting indefinitely if layout never settles.
      const maxTimer = setTimeout(cancel, 3000);
      cancelSettleRef.current = cancel;
    },
    [landOn],
  );

  useEffect(() => {
    if (!ready) return;
    const orderedIds = idsKey ? idsKey.split('|') : [];
    if (orderedIds.length === 0) return;

    // A couple of px of tolerance absorbs the sub-pixel gap a settled jump
    // can leave short of the exact boundary (float rounding in the scroll
    // math), so the section it just landed on still counts as current.
    const applyActive = () => {
      // Bottom of the page → force the last section (it may be too short to
      // ever occupy the top of the viewport).
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        setActiveId(orderedIds[orderedIds.length - 1]);
        return;
      }
      const boundary = stickyStackHeight() + 2;
      let current = orderedIds[0];
      for (const id of orderedIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= boundary) current = id;
      }
      setActiveId(current);
    };

    // Right after a click-triggered jump, `applyActive` can be geometrically
    // correct about a stale, pre-banner-catch-up layout — which is exactly
    // what we don't want shown. Hold it off, re-arming a short debounce on
    // every `scroll` event, until things actually stop moving.
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const recompute = () => {
      if (suppressRef.current) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          suppressRef.current = false;
          applyActive();
        }, 120);
        return;
      }
      applyActive();
    };

    // A URL hash naming one of our sections on arrival (a fresh cross-route
    // <Link href="/{slug}#about">, e.g. from Orders) needs the same landing +
    // settle-correction a same-page click gets — see the doc comment above —
    // so just route through `scrollToSection` rather than duplicating it.
    const hashId = window.location.hash.slice(1);
    if (orderedIds.includes(hashId)) {
      scrollToSection(hashId);
    } else {
      recompute();
    }

    window.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);

    // --sticky-stack-h can change independent of scrolling (e.g. the amber
    // order-by bar's min-spend message toggling on, or the condensed header
    // phasing in) — StickyShopBlock republishes it via a style mutation on
    // <html>, so recompute then too; `boundary` above always reads it live.
    const heightObserver = new MutationObserver(recompute);
    heightObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      heightObserver.disconnect();
      cancelSettleRef.current();
    };
  }, [idsKey, ready, scrollToSection]);

  return [activeId, scrollToSection];
}
