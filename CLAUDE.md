# Sexy Worktree

A macOS desktop app that manages multiple git worktrees inside a single window. Each worktree is shown as a card with embedded interactive terminals, and worktree CRUD happens entirely inside the app.

## Design

Before doing **any** UI work — adding components, building new screens, changing styles — read [`DESIGN.md`](DESIGN.md) first. It is the source of truth for color tokens, typography, spacing, component patterns, and anti-patterns. The workflow for introducing new tokens, patterns, or screens is at the bottom of that document.

## Tech stack (summary)

- Electron 33+ / React 18+ / TypeScript 5+
- Terminals: xterm.js + node-pty
- Split layout: Allotment
- Persistence: better-sqlite3 + macOS Keychain (Electron `safeStorage`)
- AI integration: `@anthropic-ai/claude-code` (reuses Max subscription — direct Anthropic API calls are forbidden)
- Atlassian: direct REST calls (do not use mcp-atlassian)

## Code conventions

- **Icons:** `lucide-react` only. No emoji (📁 ✓ ●), no Unicode visual symbols (✓ ✗ ● ◀ ▶ ⏳ ○ ×).
- **Typography:** `JetBrains Mono` for everything — body, headers, modals, terminals. No sans-serif anywhere.
- **Color, spacing, radius:** use the tokens defined in `DESIGN.md`. Never hard-code hex values in components.
- **Process boundary:** the renderer must not call Node APIs directly. All git, PTY, and filesystem access goes through the main process via IPC.

## Hard prohibitions

- Direct calls to the Anthropic API (use the Claude Code SDK instead).
- Using mcp-atlassian (call the Atlassian REST API directly).
- Opening the app from a worktree path (only the main repo is allowed).
- Non-force delete options (always `git worktree remove --force` + `rm -rf`).
- Auto-replaying PTY commands on session restore.
- Storing secrets (Jira tokens, etc.) in `.sexyworktree/config.json` — use the Keychain.
- Using OS emoji or Unicode visual symbols in UI.
- Light-mode branches (dark only at MVP).
