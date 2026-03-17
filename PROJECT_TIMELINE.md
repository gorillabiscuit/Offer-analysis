# Project Timeline: Offer Analysis

## Summary

- **Total commits:** 42
- **First commit date:** 2025-06-09
- **Last commit date:** 2025-06-13
- **Main technologies/libraries:** React, TypeScript, D3, Material UI (+ Emotion), Create React App (`react-scripts`), Cloudflare Workers/Pages deployment config, external data APIs (Tinybird pipes and collection resolver service).

This project evolved quickly over five days from a working proof-of-concept into a much more polished lending analysis tool. The early work focused on getting a scatterplot and currency switching functional, then shifted into intense UX tuning around draggable "your offer" interactions. The key turning point came when real market data started driving the graph: point density, outliers, and uneven distribution forced changes to domain expansion, contour behavior, formatting, and empty-state handling. From there, the work moved into correctness (median and conversion logic), responsiveness, and reliability (stale redraw fixes, render-loop fixes, and cleaner API flow). The overall arc is very much "ship fast, learn from real data, then harden."

---

## Data Reality Inflection Point (the important story)
**Date range:** 2025-06-10 to 2025-06-13

### What changed in understanding
- Once real loan data was wired in, the graph could no longer be treated as a neat synthetic scatter.
- Actual point placement exposed skewed distributions, sparse/empty segments after filtering, and contour artifacts when the domain or currency changed.
- That forced a shift from "draw points" to "continuously reconcile data state, domain state, and render state."

### How the code adapted
- Domain expansion was tuned repeatedly (thresholds, increments, throttling) to match real drag behavior near crowded or sparse edges.
- Median and conversion logic was centralized so "initial user offer" and currency toggles stayed grounded in real data rather than UI assumptions.
- Contours were rewritten to explicitly clear/rebuild on every relevant state change, because real data made stale overlays obvious.
- Empty-state rendering was added so the chart behaves honestly when filters produce no visible loans.
- Filtering/memoization improvements were introduced to prevent runaway rerenders caused by real dataset size and frequent state transitions.

### Outcome
- The graph became data-aware rather than demo-aware: it now responds to the shape and quality of real incoming offers, not just the happy path.

---

## Phase 1 — First working baseline and chart behavior
**Date range:** 2025-06-09 (early)

### What was built or changed
- The initial app skeleton landed with core components (`App`, `ScatterPlot`, `InputControls`) and hooks for offers and user state.
- Currency switching and basic offer visualization were introduced in a working form.
- Very quickly after, chart transitions and input handling were improved to make the UI feel less abrupt.

### Key technical decisions
- Chose a **React + TypeScript + D3** stack: React for state/UI structure, D3 for chart math/rendering patterns.
- Organized logic into hooks (`useLoanOffers`, `useUserOffer`, `useScatterPlotData`) early, which made later refactors easier.
- Kept the app in CRA tooling for fast setup and predictable build behavior.

### Problems encountered
- As soon as users could interact, the chart behavior exposed rough edges (transition timing and point identity issues).
- A follow-up commit fixed offer IDs and prepared for draggable behavior, suggesting the first data model shape was not enough for stable updates.

### Outcome
- A usable foundation existed with real data, basic controls, and enough architecture to support rapid iteration.

---

## Phase 2 — Drag-and-drop UX sprint for "Your Offer"
**Date range:** 2025-06-09 (mid to late)

### What was built or changed
- A full interaction loop was built around dragging the user offer point.
- Added edge-driven domain expansion, drag tooltips, cursor affordances, and median-based initial positioning.
- Tooltips and visual semantics were refined (including color recency direction and removing clutter like Q1/Q3 lines).

### Key technical decisions
- Prioritized **real-time feedback**: market points and user point updates during drag rather than delayed state-only updates.
- Introduced explicit drag guards/state flags (like pending drag-end handling) to prevent race conditions between animation and state updates.
- Settle on median-derived defaults to give users a sensible starting position.

### Problems encountered
- Multiple fix commits in sequence point to interaction instability: "snapback," jumpy drag behavior, conflict between transitions and drag updates.
- Domain expansion had to be tuned repeatedly to avoid aggressive or jerky motion.

### Outcome
- The core differentiator (interactive offer manipulation) became smooth and coherent instead of fragile.

---

## Phase 3 — Correctness and conversion logic hardening
**Date range:** 2025-06-10

### What was built or changed
- Median calculations were centralized and user-offer initialization was made consistent.
- ETH/USDC conversion logic was made bidirectional and tied to USD-normalized values.
- Domain expansion controls were exposed/tuned with explicit constants for easier calibration.

### Key technical decisions
- Added shared median utility logic instead of scattering calculations.
- Normalized cross-currency behavior through USD value assumptions from API data to avoid state drift when toggling currencies.
- Made tuning parameters explicit in code for maintainability rather than burying them in implementation details.

### Problems encountered
- Currency toggle/state sync issues required explicit fixes, indicating earlier coupling between UI state and conversion math was brittle.
- The project paused for a "backup before major refactor," a strong signal the rendering strategy needed rethinking.

### Outcome
- Data math became more trustworthy, and interaction behavior was less likely to drift or reset unexpectedly.

---

## Phase 4 — UI polish, responsiveness, and design alignment
**Date range:** 2025-06-10 to 2025-06-11

### What was built or changed
- Significant UI and layout polish: responsive container behavior, dynamic chart resizing, dark-themed input panel, and toggle/button styling cleanup.
- Introduced `ResizeObserver` to make chart sizing react to container changes.
- Duration filtering logic was corrected so visible data truly matched selected filters.

### Key technical decisions
- Leaned into **Figma-token alignment** and design-system consistency via MUI/Emotion styling patterns.
- Moved away from rigid CSS assumptions toward container-driven responsive behavior.
- Consolidated style ownership to reduce conflicting class-based behavior.

### Problems encountered
- Multiple layout and alignment fixes imply earlier overflow and sizing edge cases.
- Filtering behavior had to be corrected, suggesting mismatch between control state and actual data subset.

### Outcome
- The app looked more production-ready and behaved predictably across viewport/layout changes.

---

## Phase 5 — Data shaping, contour UX, and deployment path
**Date range:** 2025-06-12

### What was built or changed
- Formatting became consistent across axes, tooltips, and inputs to handle real-world value ranges cleanly.
- Loan depth contour controls were moved/refined in the UI and integrated into chart behavior.
- Deployment plumbing for Cloudflare Workers/Pages was added and then adjusted.
- Build/lint friction was reduced.

### Key technical decisions
- Standardized display formatting through shared helpers for currency and percentages.
- Continued using contour visualization as an analytical layer, but made it user-toggleable.
- Added Cloudflare configuration to support practical deployment workflows.

### Problems encountered
- A very large data-related commit plus follow-up fixes suggests integration complexity and quick iteration under real dataset pressure.
- Real distributions made it clear that visual defaults and labels that worked in earlier iterations did not scale cleanly without additional normalization and formatting.
- Deployment config needed immediate follow-up changes, indicating first pass environment assumptions were slightly off.

### Outcome
- The project moved from "local interactive chart" toward "deployable product with cleaner data presentation."

---

## Phase 6 — Reliability push: rendering correctness and API cleanup
**Date range:** 2025-06-13

### What was built or changed
- Repeated contour fixes and refactors ensured stale overlays were removed and redraw logic matched current domain/data.
- Added empty-state UX so chart behavior is explicit when no loans match filters.
- Introduced collection address flow through interfaces/hooks, plus frontend exclusion filters for noisy collections.
- Removed a proxy dependency and switched collections to a direct endpoint.

### Key technical decisions
- Prioritized deterministic redraw behavior over incremental patching, including a larger scatterplot refactor.
- Added memoization to prevent runaway renders/effect loops.
- Tightened type contracts (`collectionAddress`) through the data path for cleaner filtering and API calls.

### Problems encountered
- The contour system was clearly the most stubborn area: several commits repeatedly touched the same logic to fix stale/misaligned states.
- Render loop/performance issues appeared and were addressed via memoization and broader refactor.
- Repeated edits around the same visualization files suggest the team was debugging "graph lies" caused by old geometry lingering after real data/filter/domain shifts.
- A duplicate commit with the same message indicates some churn in branch management/cherry-pick flow.

### Outcome
- By the end of this phase, the app had stronger runtime stability, cleaner filtering semantics, and better resilience when data conditions changed.

---

## Narrative takeaway

The history shows a classic product-building pattern: get a functional interaction in front of users quickly, then let real data challenge the original assumptions. The most interesting thread is how the chart logic evolved in response to actual point distributions: domain mechanics, contour redraw strategy, median/conversion consistency, and empty-state behavior all had to be rethought once live data exposed edge cases. The team kept momentum by iterating in place, and the end result is a charting experience that reflects real market behavior instead of a controlled demo scenario.
