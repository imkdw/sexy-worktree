# HTML to Figma Skill

## Purpose

Convert a rendered HTML page running on a local dev server into a Figma design. The result is added as a new wrapper frame at the user-specified Figma page, and uses the user's existing Figma design system (DS) components and variables wherever possible. If required tokens are missing from the DS, they are added automatically before the build starts. The wrapper frame is always placed in an empty area of the page so it never overlaps existing frames.

Internally mirrors the official `figma:figma-generate-design` 6-phase workflow, with HTML capture prepended as Phase 0 and a token-sync phase inserted as Phase 1. Discovery runs 4 subagents in parallel; writes happen on the main thread strictly sequentially.

## Inputs

```
/html-to-figma <dev-server-url> <figma-page-url>
```

| Argument | Format | Example |
| --- | --- | --- |
| `<dev-server-url>` | URL where the rendered HTML is served | `http://localhost:3000/dashboard` |
| `<figma-page-url>` | Target Figma page URL | `https://www.figma.com/design/abc123/MyFile?node-id=12-34` |

Parse `figma-page-url` with these rules:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId`
- Convert `-` in `nodeId` to `:` (`12-34` → `12:34`)

## Hard Rules

- Always load the `figma:figma-use` skill **immediately before every** `use_figma` write call. Skipping it causes frequent, hard-to-debug failures (Plugin API rule violations).
- `use_figma` write calls must **never run in parallel**. Phase 3 section builds run on the main thread, strictly sequential. (Figma state mutations must be strictly sequential.)
- Discovery (Phase 0) dispatches 4 subagents in a **single message**. Serial execution is forbidden.
- If a matching DS component or variable exists, you **must** use it. Raw nodes are only allowed for parts with no DS match.
- Tokens required by the build but missing from the DS **must be created automatically** in Phase 1 before any section build begins. Follow the variable patterns in `figma:figma-generate-library` (collection + mode setup, explicit `variable.scopes`, no `ALL_SCOPES` default).
- The wrapper frame **must not overlap** any existing frame on the target page. Compute existing frame bounding boxes via `mcp__figma__get_metadata` and place the wrapper in an empty area (default: to the right of the rightmost frame with 200px gutter).
- Colors are 0–1 range, fonts require `await loadFontAsync`, and page context must be reset via `setCurrentPageAsync` on every `use_figma` call.
- Never call `figma.notify()` (it throws).
- Set `layoutSizingHorizontal='FILL'` **only after** `appendChild`. Reversing the order silently fails.
- External image URLs cannot be fetched via `use_figma`. The only supported pattern is to copy `imageHash` from the reference frame produced by Phase 0's `screen-capturer` and apply it to raw image nodes.
- Section validation retry is **capped at 3 attempts**. If diff threshold isn't met after 3 retries, log a warning and proceed to the next section (do not abort).
- If DS matches return zero results, immediately ask the user "DS appears empty — proceed anyway?" and only continue after confirmation.
- Never commit `_workspace/html-to-figma/` artifacts to git (project convention).

## Pre-flight

Run all of these at command start. Abort immediately if any step fails.

1. `curl -I <dev-server-url>` — confirm reachability.
2. Parse `<figma-page-url>` → extract `fileKey` and `nodeId`. Abort if either is missing.
3. Create the `_workspace/html-to-figma/` directory.
4. Pre-load the `figma:figma-use` skill.

## Workflow

### Phase 0 — Discovery (4 subagents dispatched in parallel)

Follow the `superpowers:dispatching-parallel-agents` skill: **send all 4 Agent tool calls in a single message**. Serial dispatch is forbidden.

Each subagent saves its output to `_workspace/html-to-figma/<artifact>.json`. Pass the following context to all 4: `<dev-server-url>`, `fileKey`, `nodeId`.

| Subagent | subagent_type | Responsibility | Primary tools | Output |
| --- | --- | --- | --- | --- |
| html-parser | general-purpose | Fetch dev URL, analyze DOM tree, extract section structure / component candidates / image inventory | WebFetch, mcp__playwriter__execute (if needed) | `sections.json` |
| token-extractor | general-purpose | Extract computed styles from the page and normalize into a color / typography / spacing token map | mcp__playwriter__execute (using `getComputedStyle`) | `tokens.json` |
| ds-discoverer | general-purpose | Collect candidate DS component and variable matches **and** diff `tokens.json` against existing DS variables to produce a `missing-tokens.json` list (each entry: name, type, value, suggested collection/mode/scopes) | mcp__figma__search_design_system, mcp__figma__get_code_connect_map, mcp__figma__get_variable_defs | `ds-matches.json`, `missing-tokens.json` |
| screen-capturer | general-purpose | Capture pixel-perfect output of dev URL and produce an `imageHash` inventory. Outputs a temporary reference frame to a free area of the target file (use `find_free_area` logic from Phase 2 — must not overlap existing frames) | mcp__figma__generate_figma_design | `reference-frame-id`, `image-hashes.json` |

**Critical**: dispatch the 4 subagents inside a single response's `<function_calls>` block as 4 concurrent `Agent` tool calls. Sending them one at a time serializes the work and defeats the purpose.

### Phase 1 — Token Sync (main thread, sequential `use_figma` calls)

Precondition: `figma:figma-use` skill is loaded. Load `missing-tokens.json` from Phase 0.

If `missing-tokens.json` is empty → skip this phase entirely.

Otherwise, for each missing token:

1. Resolve the target variable collection. If the suggested collection doesn't exist, create it (with appropriate modes — at minimum a default mode).
2. Create the variable via `use_figma` using `figma.variables.createVariable(...)`.
3. Set the value for each mode in 0–1 color range (for COLOR) or raw number (for FLOAT/STRING).
4. Set `variable.scopes` **explicitly** based on the entry's suggested scopes (e.g., `['FRAME_FILL']` for surface colors, `['STROKE_COLOR']` for borders, `['TEXT_FILL']` for text). Never leave the default `ALL_SCOPES`.
5. Append the created variable's id back to an in-memory map so Phase 3 can bind it on raw nodes.

Group token creation by collection to minimize `use_figma` calls (one call per collection is ideal). Respect the 20kb response cap.

After Phase 1 completes, the DS is guaranteed to contain every token Phase 3 will need.

### Phase 2 — Wrapper Frame Placement & Creation (main thread, 1 `use_figma` call)

**Compute non-overlapping position first**:

1. Call `mcp__figma__get_metadata` on the target `nodeId` (or page if `nodeId` is a page node) to retrieve all direct child frames with their `absoluteBoundingBox` values.
2. Determine the placement coordinate using this default heuristic:
   - If no children exist → place at `(0, 0)` of the parent.
   - Otherwise → `x = max(child.x + child.width) + 200`, `y = min(child.y)` (right of the rightmost frame, top-aligned, 200px gutter).
3. Verify the chosen rectangle (placement coord + reference frame size) does not intersect any existing child bounding box. If it does (rare edge case), fall back to placing below the bottommost frame: `x = min(child.x), y = max(child.y + child.height) + 200`.

**Then create the wrapper** via a single `use_figma` call:

- Frame name: `html-to-figma-<ISO timestamp>`
- Position: the computed `(x, y)`
- Size: identical to Phase 0 `screen-capturer`'s reference frame
- Auto-layout: `VERTICAL`, padding 0
- Parent: the input `nodeId` (or page)
- Store the resulting `wrapperFrameId` in main-thread memory

### Phase 3 — Section Build Loop (main thread, sequential `use_figma` calls)

Load all Phase 0 / Phase 1 artifacts, then iterate over each entry in `sections.json` (parallelism strictly forbidden).

For each section:

1. **Decide DS matching**
   - Check `ds-matches.json` for a matching component for this section.
   - Match found → build as an instance.
   - No match → build as raw nodes with variables bound (existing DS vars from `ds-matches.json` or newly created ones from Phase 1's in-memory map).
2. **Execute build (`use_figma` call)**
   - Reset page context with `setCurrentPageAsync` immediately before each call.
   - Response is capped at 20kb → split large sections into chunks per child node and send across multiple calls.
   - Colors must be 0–1 range; fonts require `await loadFontAsync`.
3. **Section validation loop (max 3 retries)**
   - Capture the built section with `mcp__figma__get_screenshot`.
   - Compare against the same region of `screen-capturer`'s reference capture.
   - If the diff exceeds the threshold, attempt a patch via another `use_figma` call.
   - After 3 retries, log a warning and proceed to the next section (never abort).
4. **Append to wrapper**
   - Call `wrapperFrameId.appendChild(sectionNode)`.
   - **Only then** set `layoutSizingHorizontal='FILL'` (order is critical).

### Phase 4 — Image Hand-off (main thread)

- Load `image-hashes.json`.
- Walk the assembled wrapper frame and find raw image nodes (or placeholders).
- Apply the matching `imageHash` from the reference frame using position/size matching.
- Delete Phase 0's reference frame.

### Phase 5 — Final Full-view Validation (main thread)

- Capture the entire wrapper frame with `get_screenshot` once.
- Compare against `screen-capturer`'s reference capture — **for reporting only**, no automatic fix at this stage.
- Report the following to the user:
  - Final wrapper frame Figma URL
  - Total number of sections built
  - DS match rate (% — matched / total)
  - Number of tokens auto-created in Phase 1 (with names)
  - Wrapper frame final position `(x, y)`
  - List of sections that triggered retries
  - List of sections with remaining validation mismatches

## Verification Checklist

After the run completes, confirm all of the following:

1. The wrapper frame exists at the input `fileKey`/`nodeId` (verify via `mcp__figma__get_metadata`).
2. The wrapper frame's bounding box does **not** intersect any other child frame's bounding box on the same parent.
3. Every token listed in `missing-tokens.json` now exists in the DS (verify via `mcp__figma__get_variable_defs`).
4. Phase 0's reference frame has been deleted (verify absence via `mcp__figma__get_metadata`).
5. `_workspace/html-to-figma/` is in `.gitignore` or is not staged.
6. Sections with remaining mismatches were clearly reported to the user.
7. All `use_figma` calls were executed serially (no parallel calls occurred).

## Usage Example

```
/html-to-figma http://localhost:3000/dashboard https://www.figma.com/design/abc123XYZ/SexyWorktree?node-id=12-34
```

The above command will:
1. Analyze, capture, and DS-match the rendered `localhost:3000/dashboard` page using 4 parallel subagents.
2. Auto-create any missing DS tokens (color/typography/spacing) before the build starts.
3. Compute a non-overlapping position on node `12:34` and create a new wrapper frame there.
4. Build sections using DS components wherever possible, with raw nodes (bound to DS variables) elsewhere.
5. Run per-section pixel-diff validation, then report the result URL, DS match rate, and the list of newly created tokens.
