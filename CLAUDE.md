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

## Testing

After any UI or feature change, you **must** use the `playwright-electron` MCP to launch the app and verify the behavior directly. Do not report a task as "done" based on type checks or unit tests alone.

- Open the affected screens with `playwright-electron` and exercise the golden path plus key edge cases by clicking/typing through them.
- Touch adjacent features that could regress — anything sharing the same component tree or IPC handler as the change.
- If console errors or warnings appear, diagnose the cause before reporting (`browser_console_messages`).
- If the app fails to launch or the environment blocks testing, say "could not test" explicitly. Never claim "verified working" without actually running it.
- Exception: pure doc/comment edits and other changes with no runtime impact.

## Hard prohibitions

- Direct calls to the Anthropic API (use the Claude Code SDK instead).
- Using mcp-atlassian (call the Atlassian REST API directly).
- Opening the app from a worktree path (only the main repo is allowed).
- Non-force delete options (always `git worktree remove --force` + `rm -rf`).
- Auto-replaying PTY commands on session restore.
- Storing secrets (Jira tokens, etc.) in `.sexyworktree/config.json` — use the Keychain.
- Using OS emoji or Unicode visual symbols in UI.
- Light-mode branches (dark only at MVP).
