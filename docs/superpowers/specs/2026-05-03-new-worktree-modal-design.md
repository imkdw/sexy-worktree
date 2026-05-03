# New Worktree Modal Redesign

## Goal

Redesign the `New Worktree` modal so it feels like a polished, compact IDE workflow instead of a sparse form inside a generic dialog.

The modal must keep the existing creation behavior:

- Direct branch creation.
- Jira ticket resolution.
- Jira setup preflight handling.
- Inline validation and create errors.
- No new IPC API surface.

## Current State

The modal currently uses a header, Radix tabs, one form per tab, and bottom-right actions.

This works functionally, but the visual hierarchy is weak:

- `Direct` and `From Jira` look like document tabs, even though they are creation methods.
- The title, tabs, form field, hint, and actions all sit at similar visual weight.
- The direct flow has no useful create preview beyond a generic hint.
- The Jira preflight state is visually separate from the shared create rhythm.

## Chosen Direction

Use the `Method Cards` layout.

The modal keeps a single dialog container, but replaces the tab list with two method cards:

- `Direct` — `Type an exact branch name.`
- `From Jira` — `Resolve a ticket into a branch.`

The selected card is visually active with:

- `bg-elevated`
- `border-accent`
- a subtle `accent-soft` outer emphasis

The inactive card keeps the same shape with a quieter border and text treatment. The accent should appear only on the selected method card and the primary create button, keeping the modal inside the `DESIGN.md` accent budget.

## Layout

The dialog uses the existing Radix Dialog wrapper and `DESIGN.md` modal rules:

- `bg-surface`
- `rounded-lg`
- `border-border-subtle`
- `p-6`
- `max-width` close to the existing normal/wide modal width
- title in `text-lg font-semibold`
- all typography remains `JetBrains Mono`

Structure:

1. Header
2. Method selector
3. Method form panel
4. Always-visible create summary
5. Footer actions

The header contains:

- Title: `New Worktree`
- Description: `Choose how to name the branch, then create.`
- Close button using the existing `Dialog.Close`

The footer contains:

- `Cancel`
- `Create Worktree`

The primary action should use existing primary button styling: `bg-accent`, compact padding, and disabled opacity.

## Method Form Behavior

### Direct

Direct is the fastest path.

When `Direct` is selected:

- Show a single `Branch Name` input.
- Use existing `validateBranchName` behavior.
- Disable `Create Worktree` while the branch is empty, invalid, or busy.
- Show validation errors inline below the input.
- Remove the generic `Creates in the configured worktree directory.` hint, because the summary now carries that information more precisely.

### From Jira

Jira remains a two-step flow.

Before resolve:

- Show `Jira Ticket (URL or ID)` input.
- Show a `Resolve` button in the same row.
- Disable `Create Worktree`.

After resolve succeeds:

- Show `Branch Preview`.
- Keep the preview read-only by default.
- Preserve the existing pencil icon affordance for editing the generated branch.
- Enable `Create Worktree` only when the resolved or edited branch is valid.

Resolve errors and create errors stay inline near the relevant Jira fields.

### Jira Preflight

If Jira is disabled or the token is missing:

- Keep the method selector visible.
- Show the existing setup notice in the form panel area.
- Preserve the Settings action.
- Keep `Create Worktree` disabled.
- Keep the always-visible summary below the notice.

This makes the selected method, the blocking configuration state, and the repository creation context visible together.

## Create Summary

The modal always shows a create summary below the method form panel.

The summary should show compact read-only context:

- `Base branch` from repo config, usually `defaultBaseBranch`.
- `Worktree directory` from repo config, usually `baseDir`.
- `Target path` when a branch value exists or can be inferred.

The summary is not a card inside a card. It is a quiet bordered panel inside the modal:

- `border-border-subtle`
- `rounded-md`
- text at `text-xs`
- labels in `text-muted`
- values in `text-secondary`
- no accent color

Target path preview should update from:

- Direct branch input.
- Jira suggested branch after resolve.
- Jira edited branch while editing.

If the target path cannot be inferred without duplicating main-process path resolution rules, the renderer may show a conservative preview using the configured `baseDir` and branch string. Exact filesystem validation remains in the existing main-process create path.

## Component Boundaries

`NewWorktreeModal` should remain the orchestration component.

It owns:

- open/close handling
- selected method
- busy state
- submit error state
- repo config loading
- submit handlers
- Jira preflight state handoff

New or reshaped UI units:

- `WorktreeMethodSelector`
  - Renders the two method cards.
  - Receives selected method and `onChange`.
  - Handles only visual selection and accessible button semantics.

- `WorktreeCreateSummary`
  - Renders base branch, worktree directory, and target path preview.
  - Receives config-derived values and the current branch preview.
  - Does not call IPC.

- `DirectTab`
  - May keep its filename for now, but should behave as a method panel.
  - Owns only direct branch input and direct validation UI.

- `JiraTab`
  - May keep its filename for now, but should behave as a method panel.
  - Owns ticket input, resolve state, branch preview editing, and Jira-specific inline errors.

This keeps the redesign scoped and avoids unrelated renaming churn.

## Data Flow

No new IPC contracts are required.

On modal open:

- Find the active repo from `useRepos`.
- Load repo config through `api.config.get`.
- Read `branchValidation.requireJiraPattern`.
- Read worktree config fields needed by `WorktreeCreateSummary`.

Direct flow:

- Local branch input updates validation and summary preview.
- Submit calls existing `api.newWorktree.create({ repoId, branch })`.

Jira flow:

- Local ticket input calls existing `api.jira.resolve`.
- Resolve result sets `ticketKey`, `summary`, and suggested branch.
- Suggested or edited branch updates validation and summary preview.
- Submit calls existing `api.newWorktree.create({ repoId, branch })`.

Create error mapping continues to use the existing `createErrorMessage` behavior.

## Error Handling

Use inline errors only.

Direct errors:

- invalid branch reason below the branch input
- create rejection below the branch input

Jira errors:

- resolve error below the ticket input
- invalid branch preview below the branch preview
- create rejection below the branch preview

Do not add:

- toast errors for these form-correctable states
- red modal borders
- global dialog error banners

## Accessibility

The method cards must be real buttons or Radix-compatible button controls.

Required behavior:

- Accessible names: `Direct` and `From Jira`.
- Keyboard focus uses the existing focus ring style.
- Selected state is exposed with `aria-pressed` or equivalent selected semantics.
- Disabled/busy states prevent duplicate create actions.
- Existing dialog focus trap and close behavior remain unchanged.

Icons must use `lucide-react` only.

## Design Rules

Follow `DESIGN.md`.

Required constraints:

- No hard-coded hex colors in React components.
- No emoji or Unicode visual symbols.
- No new color tokens.
- No 14px text.
- Spacing stays on the `4 / 8 / 12 / 16 / 24 / 32` scale.
- Accent remains sparse: selected method, primary CTA, and keyboard focus only.
- Chrome scrollbars remain hidden if any new overflow container is introduced.

## Testing Requirements

Unit or renderer tests should cover:

- Direct create still calls `api.newWorktree.create` with the typed branch.
- Direct invalid branch disables create and shows inline validation.
- Jira preflight keeps create disabled and shows the Settings action.
- Jira resolve success shows branch preview and enables create for valid branches.
- Jira create failure stays inline and does not leak into Direct after switching methods.
- Jira stale create errors clear when ticket input or branch preview changes.
- Summary renders base branch and worktree directory.
- Summary target preview updates from Direct input and Jira resolved branch.

Manual verification with `playwright-electron` must cover:

- Open the app from the main repo only.
- Open `New Worktree`.
- Switch between Direct and From Jira using pointer and keyboard.
- Create a direct branch through the golden path.
- Trigger a direct validation error.
- Visit Jira preflight when config or token is missing.
- Resolve a Jira ticket when config is available, edit the branch preview, and create.
- Confirm no browser console errors or warnings are introduced.

If the local environment cannot launch Electron or cannot satisfy Jira setup, report the untested path explicitly.

## Non-Goals

This redesign does not:

- Change worktree creation semantics.
- Add new Jira settings behavior.
- Add a new design token.
- Redesign all dialogs.
- Rename every `DirectTab` / `JiraTab` reference purely for naming consistency.
- Add exact path validation to the renderer.
