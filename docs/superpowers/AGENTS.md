# SUPERPOWERS DOCS KNOWLEDGE

## OVERVIEW

`docs/superpowers` stores durable feature specs and executable implementation plans. It is project knowledge, not scratch space.

## STRUCTURE

```text
docs/superpowers/
|-- specs/  # feature/design specs before implementation
`-- plans/  # task-by-task implementation plans for agentic workers
```

## WHERE TO LOOK

| Task                     | Location                       | Notes                                                 |
| ------------------------ | ------------------------------ | ----------------------------------------------------- |
| Feature intent/design    | `specs/YYYY-MM-DD-*-design.md` | Goal, current state, chosen model, constraints, tests |
| Implementation checklist | `plans/YYYY-MM-DD-*.md`        | Exact files, checkbox steps, commands, verification   |
| Local scratch            | `.superpowers/`                | Gitignored; not canonical evidence                    |

## CONVENTIONS

- Use date-prefixed kebab-case names: `YYYY-MM-DD-topic.md`.
- Specs commonly use `-design` suffix and describe intent, current state, chosen approach, data/component flow, accessibility/design rules, testing requirements, and non-goals.
- Specs are implementation-aware but should not become line-by-line edit scripts.
- Plans start with `# <Feature> Implementation Plan`, then an agentic-worker note requiring `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
- Plans include `Goal`, `Architecture`, `Tech Stack`, `File Structure`, numbered tasks, checkbox steps, code blocks, exact commands, expected output, verification, and self-review.
- Plans are intentionally prescriptive enough for a low-context worker.

## ANTI-PATTERNS

- Do not treat `.superpowers/` as durable documentation; it is gitignored scratch.
- Do not commit scratch notes unless promoted into a spec or plan.
- Do not store generic project docs here; use this tree for Superpowers specs/plans.
- Do not write implementation plans without exact file paths and verification commands.
- Do not let specs contradict `DESIGN.md` for UI work; update design rules first if the spec needs a new pattern.
