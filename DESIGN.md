# Sexy Worktree — Design System

> This document is the **source of truth** for design. Read it before creating any new screen or modifying existing UI code, and follow the tokens, rules, and patterns defined here. If an external mock-up (Claude Design, Figma, etc.) disagrees with this document, either redraw the mock-up to match this document, or — if the new pattern is genuinely better — update this document first, then write code on top of the updated rules.

---

## 1. Philosophy

The app's single promise is **"see all your terminal cards in one window at once."** Design must never get in the way of that promise.

- **Darcula chrome + black terminal.** Outside the cards (rail, toolbar, tabs, modals, card chrome) is Darcula-style warm dark gray — large layer-to-layer luminance gaps give compact terminal cards real visual structure. Inside the cards is pure black: the chrome ↔ terminal contrast is what makes the terminal area pop.
- **Restraint first.** No more than 4-5 colors per screen. The accent appears only where "this is active or important".
- **Distinctive through structure, not palette.** Identity comes from all-mono typography, the in-window terminal grid, and instant worktree CRUD — not from a unique color scheme. We adopt a proven IDE chrome (Darcula) precisely because it works for compact, dense, multi-pane interfaces.
- **Dark only (MVP).** Light mode and system-follow are out of scope for the first release.

## 2. Color tokens

Dark only. Every token is named by **role (semantic)**, never by hue. Do not hard-code hex values in components.

### 2-1. Surface (background layers)

| Token                   | Value     | Tailwind               | Use                                           |
| ----------------------- | --------- | ---------------------- | --------------------------------------------- |
| `--color-background`    | `#2B2B2B` | `bg-background`        | Window background, grid background            |
| `--color-surface`       | `#3C3F41` | `bg-surface`           | Cards, modals, rail row hover                 |
| `--color-elevated`      | `#4E5254` | `bg-elevated`          | Dropdowns, tooltips, input fields             |
| `--color-border-subtle` | `#323232` | `border-border-subtle` | Card borders, dividers                        |
| `--color-border-strong` | `#555555` | `border-border-strong` | Input borders, emphasized dividers            |
| `--color-terminal-bg`   | `#000000` | `bg-terminal-bg`       | Terminal pane body, xterm.js theme background |

### 2-2. Text

| Token                    | Value     | Tailwind              | Use                                      |
| ------------------------ | --------- | --------------------- | ---------------------------------------- |
| `--color-text-primary`   | `#DFE1E5` | `text-text-primary`   | Body, active tab, active worktree name   |
| `--color-text-secondary` | `#BBBBBB` | `text-text-secondary` | Card header (branch name), inactive tabs |
| `--color-text-muted`     | `#808080` | `text-text-muted`     | Repo path, meta info, inactive icons     |
| `--color-text-faint`     | `#5C6164` | `text-text-faint`     | Placeholder, weakest hint                |

### 2-3. Semantic

| Token                 | Value                        | Tailwind                                    | Use                                                           |
| --------------------- | ---------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `--color-accent`      | `#4B6EAF` (Darcula blue)     | `bg-accent`, `text-accent`, `border-accent` | Active indicator (dot), primary CTA, focus ring, hovered icon |
| `--color-accent-soft` | `Darcula blue @ 30% opacity` | `border-accent-soft`                        | Active card border, outer focus ring                          |
| `--color-in-progress` | `#FBBF24` (amber-400)        | `text-in-progress`, `border-in-progress`    | Skeleton card border, `Loader2` color, in-progress step       |
| `--color-success`     | `#34D399` (emerald-400)      | `text-success`, `border-success`            | Completed step, success toast                                 |
| `--color-destructive` | `#F87171` (red-400)          | `text-destructive`, `bg-destructive`        | Force Delete button, failed step, error toast                 |

### 2-4. Accent usage rule

> If `--color-accent` appears **3+ times on a single screen, be suspicious.**

Allowed locations:

- Active worktree dot (exactly one in the rail)
- Active card border (exactly one focused card)
- Primary CTA (e.g. modal `Confirm` button)
- Focus ring (tabs, inputs — only during keyboard navigation)

Forbidden:

- Generic hover effect main color (use surface change for hover)
- Body text or default icon color
- Decoration

## 3. Typography

### 3-1. Font family

**One family for everything: `JetBrains Mono`.**

| Token         | Family           | Fallback                                         |
| ------------- | ---------------- | ------------------------------------------------ |
| `--font-mono` | `JetBrains Mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` |

This includes body, headers, modals, tabs, toolbars — every text node in the app. The all-mono choice is intentional: it cements the "terminal tool" identity and removes the ambiguity of choosing between sans and mono per element.

### 3-2. Scale

| Token         | Size / line | Tailwind    | Use                                  |
| ------------- | ----------- | ----------- | ------------------------------------ |
| `--text-xs`   | 11px / 16px | `text-xs`   | Meta (timestamps, hints)             |
| `--text-sm`   | 12px / 18px | `text-sm`   | Body, rail items, tabs, card headers |
| `--text-base` | 13px / 20px | `text-base` | Modal body, toolbar                  |
| `--text-lg`   | 15px / 22px | `text-lg`   | Modal titles, section headers        |
| `--text-xl`   | 18px / 24px | `text-xl`   | Empty-state headlines                |

> 14px is intentionally omitted. Compact density requires a clear gap between body (12-13) and headers (15+); 14 dilutes that gap.

### 3-3. Weight

- `400` regular: Body
- `500` medium: Card headers, active tabs, buttons
- `600` semibold: Modal titles, empty-state headlines — never heavier

> Mono weights have less visual contrast than sans-serif weights, so additional hierarchy must come from size and spacing, not from `700+` weights.

## 4. Spacing, Radius, Border

### 4-1. Spacing scale

`4 / 8 / 12 / 16 / 24 / 32` (px). No 5, 7, 10, 11, or other off-scale values.

| Token         | Value | Tailwind              |
| ------------- | ----- | --------------------- |
| `--spacing-1` | 4px   | `p-1`, `m-1`, `gap-1` |
| `--spacing-2` | 8px   | `p-2`, `m-2`, `gap-2` |
| `--spacing-3` | 12px  | `p-3`, `m-3`, `gap-3` |
| `--spacing-4` | 16px  | `p-4`, `m-4`, `gap-4` |
| `--spacing-6` | 24px  | `p-6`, `m-6`, `gap-6` |
| `--spacing-8` | 32px  | `p-8`, `m-8`, `gap-8` |

Common combinations:

- Card inner padding: `12px`
- Card-to-card gap: `12px`
- Modal padding: `24px`
- Vertical section gap: `16px` or `24px`

### 4-2. Radius

| Token           | Value  | Use                                   |
| --------------- | ------ | ------------------------------------- |
| `--radius-sm`   | 6px    | Small buttons, badges                 |
| `--radius-md`   | 10px   | **Default for cards, modals, inputs** |
| `--radius-lg`   | 14px   | Large modals, full-screen overlays    |
| `--radius-full` | 9999px | Dot indicators, avatars               |

> 10px (not 8px) is the default. It sits between Linear's 12px (too round for compact cards) and VS Code's 8px (visually unremarkable) — the sweet spot that keeps cards from looking generic.

### 4-3. Border

- All borders are **1px hairline.** 2px or thicker is forbidden, except the dashed borders on **in-progress** (amber) and **failed** (red) card variants — see §6-5.
- Use `--color-border-subtle` by default, `--color-border-strong` when emphasis is needed, `--color-accent-soft` for the active card.

## 5. Iconography

- **`lucide-react` only.** No emoji (📁 📊 🎯), no Unicode visual symbols (✓ ✗ ● ◀ ▶ ⏳ ○ × → ←).
- Default size 16px. Use 14px in tight spots, 20px in prominent ones. Keep lucide's default `stroke-width: 1.5`.
- Default color is `--color-text-muted`; on hover, switch to `--color-accent`. For destructive actions, use `--color-destructive`.

Common icon mapping:

| Role                  | lucide name              |
| --------------------- | ------------------------ |
| Open repository       | `FolderOpen`             |
| Overview mode         | `LayoutGrid`             |
| Focus mode            | `Maximize2`              |
| New worktree          | `Plus`                   |
| Card vertical split   | `SplitSquareVertical`    |
| Card horizontal split | `SplitSquareHorizontal`  |
| Close pane            | `X`                      |
| Collapse rail         | `ChevronLeft`            |
| In progress           | `Loader2` (animate-spin) |
| Done                  | `Check`                  |
| Pending               | `Circle`                 |
| Failed                | `X` or `XCircle`         |
| Re-run hint           | `Play`                   |

## 6. Component patterns

### 6-1. Card (worktree card)

```
[ Header (h-9, padding 12px) ─────────────────────────────────────── ]
  branch name (--font-mono, --color-text-secondary, --text-sm, weight-500)
                       [hover only] SplitV  SplitH  X (--color-text-muted)
[ Body (terminal panes, Allotment split) ──────────────────────── ]
  background: --color-terminal-bg
  pane border: 1px --color-border-subtle
```

- Card border: `1px --color-border-subtle` by default; active card uses `1px --color-accent-soft`.
- No drop shadows on the card — the layer-to-layer luminance gap (#3C3F41 over #2B2B2B) is enough lift.
- Header action group fades in on hover (150ms ease).

### 6-2. Tab (repo tab)

- Active: `--color-text-primary` + 2px bottom line in `--color-accent`.
- Inactive: `--color-text-secondary`; hover gives `--color-surface` background.
- Close (`X`) icon: hidden by default, fades in on hover.

### 6-3. Toolbar

- Left: repo path (`--font-mono`, `--color-text-muted`, `--text-sm`).
- Right: icon button group (32×32, 8px gap).
- Active mode button uses `--color-elevated` background + `--color-text-primary` icon.

### 6-4. Rail (left sidebar)

- 160px wide, collapsible (collapses to 0 or 48px).
- Row height 32px, padding 8px 12px.
- Active row: filled dot (`--color-accent`) + `--color-text-primary`.
- Inactive row: hollow dot (`--color-border-strong`) + `--color-text-secondary`.
- Hover: `--color-surface` background.

### 6-5. Card state variants

A worktree card has four lifecycle states. Border treatment encodes the state:

| State                      | Border                                     | Body                                                                                   |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Normal                     | `1px --color-border-subtle` (default Card) | Terminal panes                                                                         |
| In progress (provisioning) | `2px dashed --color-in-progress`           | Provisioning checklist (see below)                                                     |
| Failed                     | `2px dashed --color-destructive`           | Provisioning checklist with `XCircle` on the failed step + `Retry` / `Cleanup` actions |
| PTY crash                  | `1px --color-border-subtle` (default)      | Centered `AlertCircle` + `Restart` button                                              |

Only **In progress** and **Failed** break the 1px hairline rule. PTY crash uses the default border because the crash is informational, not an active provisioning state.

#### Provisioning checklist (used by In progress and Failed)

- Six-step checklist, each step = icon + label.
- Label: `--font-mono`, `--text-sm`.
- Only the active step uses `--color-text-primary` for its label; the rest use `--color-text-muted`.
- Step icons:
  - Done: `Check` `--color-success`
  - In progress: `Loader2` (animate-spin) `--color-in-progress`
  - Pending: `Circle` `--color-text-faint`
  - Failed: `XCircle` `--color-destructive`

### 6-6. Modal

- Backdrop: `rgba(0,0,0,0.6)` + `backdrop-blur-sm`.
- Container: `--color-surface`, `--radius-lg`, padding 24px, max-width 480px.
- Title: `--text-lg`, weight-600.
- Close button at top-right (`X`, `--color-text-muted`).
- Action buttons aligned bottom-right: `Cancel` (ghost) → `Confirm` (primary, `--color-accent` background).

### 6-7. Empty state

- Centered, container max-width 360px.
- Icon (24px, `--color-text-faint`) → headline (`--text-xl`) → description (`--color-text-secondary`) → CTA button.
- Extra meta (e.g. recent list) sits 16px below the CTA.

### 6-8. Scrollbar

Scrollbars follow one of two policies.

| Area                                   | Policy       | Expression                                                    |
| -------------------------------------- | ------------ | ------------------------------------------------------------- |
| Chrome (main area, Rail, modals, etc.) | Fully hidden | Scroll only via wheel/trackpad. Removes visual noise.         |
| Terminal (xterm)                       | hover-reveal | Transparent by default; thumb only appears on viewport hover. |

- When creating a new `overflow-*` container in Chrome areas, you must apply the `scrollbar-hidden` utility alongside it.
- Terminal thumb color is `--color-border-strong`, width 8px, radius full. The track is always transparent.
- Any scrollbar expression outside these two policies (e.g. a custom-colored, always-visible scrollbar) is forbidden.

## 7. State conventions

| State             | Expression                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Default           | Use base color tokens directly                                                                            |
| Hover             | Background one layer brighter (`--color-background` → `--color-surface`), or text/icon one shade stronger |
| Active / Selected | Use `--color-accent` (respect the rule in §Color tokens)                                                  |
| Focus (keyboard)  | 2px `--color-accent-soft` outer ring + 1px `--color-background` inner gap                                 |
| Disabled          | Opacity 0.4, cursor `not-allowed`                                                                         |
| Loading           | `Loader2` animate-spin; adjacent elements disabled                                                        |
| Error             | `--color-destructive` border or text; icon is `AlertCircle`                                               |

## 8. Motion

| Kind                                               | Duration | Easing                          |
| -------------------------------------------------- | -------- | ------------------------------- |
| Fast hover / fade                                  | 150ms    | `ease-out`                      |
| Standard transition (modal open, rail toggle)      | 200ms    | `ease-in-out`                   |
| Large change (focus mode entry, card layout shift) | 300ms    | `cubic-bezier(0.16, 1, 0.3, 1)` |

> Never exceed 300ms. Long motion accumulates into a sluggish workflow.

## 9. Anti-patterns

These are auto-reject in code review:

- Emoji or Unicode visual symbols (📁 ✓ ● etc.) — use `lucide-react` instead.
- Gradient backgrounds, glow effects, colored shadows.
- Borderless cards (the 1px hairline is part of the identity).
- `--color-accent` as the main hover color (hover is expressed via surface change).
- 14px body text (use 12 or 13).
- Spacing values outside `4 / 8 / 12 / 16 / 24 / 32` (no 5, 7, 10, 11, etc.).
- Hard-coding a new color as hex without registering a token first.
- Light-mode branches (out of scope).
- `--color-accent` appearing 3+ times on a single screen (matches §2-4).
- `backdrop-blur` outside of modals or full overlays.
- Mixing in a sans-serif font (everything is `JetBrains Mono`).
- Tailwind arbitrary values (`p-[7px]`, `bg-[#ff0000]`) — ESLint blocks these.
- Hard-coded hex inside inline `style` — always use `var(--color-…)` or the `cssVar()` helper.
- Exposing the OS default scrollbar (using `overflow-auto` / `overflow-y-auto` without the `scrollbar-hidden` utility).

## 10. Decision log

> New decisions go on top (reverse-chronological). One line: **decision** — _why_.

- **2026-05-01 — Adopted Darcula-style chrome (#2B2B2B / #3C3F41) with Darcula Blue (#4B6EAF) accent; terminal interior stays #000000.** Replaces the zinc-950 chrome + cyan-400 accent. The zinc layering had too small a per-step luminance gap, so cards visually merged with the background and the grid structure was hard to read. Darcula's chrome → panel jump (#2B2B2B → #3C3F41) gives instant card structure, and keeping the terminal at #000 creates a strong chrome ↔ terminal contrast that makes the terminal area the primary visual focus. Trade-off: gives up §1's "avoid VS Code-style palette" stance — distinctiveness now anchors on all-mono typography + in-window terminal CRUD, not on a unique color identity. New token `--color-terminal-bg` (#000000) needed because the card body and `--color-background` no longer match. State colors (amber / emerald / red) intentionally unchanged — already learned signals, and they pop harder against warm gray than against near-black.
- **2026-04-28 — Adopted Radix Primitives (Dialog, Tabs, Tooltip, ToggleGroup, Toggle, Label).** Take headless behavior and a11y only; styling stays on our tokens. Wrappers live in `src/renderer/ui/`. Z-index policy: Dialog Overlay/Content `z-[1000]`, Tooltip `z-[1500]`, Toast `z-[2000]`. Replaces the hand-rolled modal backdrop / `stopPropagation` pattern — Esc, focus trap, and `aria-modal` come for free. Toast / ScrollArea / TabBar (repo tabs) intentionally OUT (policy clashes or wrong model fit).
- **2026-04-28 — Drag-to-resize Rail width.** Default 200px / range 80~480px / persisted to localStorage. Coexists with the existing collapse button. First UI-preference persistence case — single value, so localStorage instead of SQLite/IPC. Revisit generalization on the second case.
- **2026-04-28 — Chrome scrollbars fully hidden, terminal only is hover-reveal.** Trackpad/wheel scrolling is enough, and the OS default scrollbar clashes with the dark palette and adds only visual noise. Terminal needs an output-position cue, so hover-reveal is the compromise. Registered as utilities (`scrollbar-hidden`, `scrollbar-terminal`) to fit the token-driven philosophy and ESLint policy.
- **2026-04-27 — Adopted Tailwind v4, removed tokens.css. @theme is the single source.** Aligned token names to the v4 prefix convention (e.g. moved to `--color-background`). `--color-base` clashed with the `text-base` font-size utility, so it was renamed to `--color-background`. Secures class-based DX + ESLint enforcement to block token bypass at the code level.
- **2026-04-27 — Adopted ESLint and Prettier.** `eslint-plugin-better-tailwindcss` blocks arbitrary values, `no-restricted-syntax` blocks hard-coded hex, `prettier-plugin-tailwindcss` auto-sorts classes.
- **2026-04-26 — Card state borders unified: in-progress (amber) and failed (red) use 2px dashed.** Same dashed treatment binds "temporary / abnormal progress" states under one visual metaphor; PTY crash keeps the default 1px because the crash is informational, not an active state. Replaces the prior "skeleton-only" exception.
- **2026-04-26 — Anti-pattern accent threshold reconciled to 3+.** §2-4 said 3+, §9 said 4+ — same number now everywhere, so the rule is unambiguous in code review.
- **2026-04-26 — Host this document at repo root.** Better discoverability for AI coding tools (lives next to `CLAUDE.md`, `README.md`); `docs/` placement is for projects too large to surface design at top-level.
- **2026-04-26 — Single font family (`JetBrains Mono`) for the entire app.** Sharpens the "terminal tool" identity, removes per-element sans-vs-mono ambiguity. Trade-off: hierarchy must rely on size/spacing instead of weight.
- **2026-04-26 — Default radius 10px.** Linear's 12px is too round; VS Code's 8px is unremarkable. The 10px sweet spot keeps cards distinctive.
- **2026-04-26 — Accent is `cyan-400`.** Warp lineage, no clash with `amber` (in-progress), avoids VS Code blue.
- **2026-04-26 — Dark only at MVP.** Light mode doubles token count and debug surface without moving the core value proposition (the terminal grid).
- **2026-04-26 — Drop 14px from the typography scale.** The 12-13 ↔ 15+ gap sharpens information hierarchy in compact density.

(TODO) Add personal decisions here. e.g. "what feeling should a user have using this app" — narrative tone influences future design choices.

## 11. Workflow for adding tokens, components, or screens

### Adding a new color or spacing token

1. First confirm existing tokens cannot express it — they almost always can.
2. If genuinely needed, add the token to the `@theme` block in `src/renderer/index.css`. Tailwind v4 generates the utility class and CSS variable simultaneously. Then update the §Color tokens / §Spacing table.
3. Add a one-line entry to §Decision log explaining the new token.

### Adding a new component pattern

1. Verify none of the seven existing patterns (Card, Tab, Toolbar, Rail, Skeleton, Modal, Empty state) cover the case.
2. If not, add the pattern under §Component patterns, ensuring it does not contradict §Anti-patterns or §State conventions.
3. Record the rationale in §Decision log.

### Designing a new screen

1. Read this document (especially §Color tokens, §Component patterns, §Anti-patterns).
2. External tools (Claude Design, Figma) may be used to generate mock-ups — but adopt only the parts that already align with this document.
3. If a mock-up disagrees with this document, choose one path:
   a. Redraw the mock-up to match.
   b. If the new pattern is better, run the workflows above (token / component) first, then write code on top of the updated rules.
4. Fix any §Anti-patterns the moment you spot them — never "later."
