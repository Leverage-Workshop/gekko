# Building diagrams with the `mcp-excalidraw-local` MCP server

Everything below was paid for in a failed session on 2026-08-28. The server's data model is
one-project-per-tenant in practice, and every deviation from that assumption fails **silently**
— reporting success while writing nothing, or writing over someone else's diagram.

## The three traps

1. **`switch_project` creates a project that `batch_create_elements` never persists to.**
   Creating a new project (`refreshing-01-mechanic`) and writing 33 elements into it reported
   "33 elements created successfully" and left **zero rows** in SQLite. The elements went to an
   in-memory queue for WebSocket delivery to clients that did not exist
   (`no_clients_in_scope`) and were never flushed.

2. **Every export resolves to the tenant's *oldest* project, not the active one.**
   `resolveScope()` in the server reads an `X-Tenant-Id` header and then unconditionally calls
   `getDefaultProjectForTenant()` — `SELECT id FROM projects WHERE tenant_id = ? ORDER BY
   created_at ASC LIMIT 1`. There is no `X-Project-Id`. So `export_scene`, `export_to_image`,
   and the health element count all read the oldest project regardless of what you switched to.
   This is true for the direct-database path (`export_scene`) as well as the browser path.

3. **Element IDs collide across diagrams and overwrite silently.**
   Generic IDs (`B1`, `B2`, `B3`) in a `batch_create_elements` call landed on top of an existing
   analyze-task diagram's elements in the gekko tenant's Default project, replacing them.
   The write reported 33 creates; three of them were destructive updates. There are no
   snapshots to roll back to (`snapshots` table was empty).

## The procedure that works

### Once per document

Switch to a tenant whose *only* project is `Default`, so "oldest project" and "the project I
want" are the same thing. The scratchpad tenant (`a12c3b85ed03`, single project
`a12c3b85ed03-default`) is the safe workspace.

```
switch_tenant → scratchpad
list_projects   # confirm exactly one project; note its id
```

Never build diagrams in the `gekko` tenant — it holds the analyze-task workflow diagram, and
trap 3 will eat it.

### Per diagram

1. **`clear_canvas`** — otherwise the previous diagram's elements land in this one's export.
2. **`batch_create_elements`** with a **unique per-diagram ID prefix**: `m_` for the mechanic
   diagram, `t_` for two-readings, `e_` for how-it-ends, `w_` for the walkthrough. Every id:
   `m_title`, `m_sub`, `m_z1`, `m_B1`. Never a bare `B1`.
3. **`export_scene`** with the target path → writes the `.excalidraw` source. This reads the
   database directly and needs no browser. **Check the reported element count matches what you
   created** — if it reports a wildly larger number you are exporting the wrong project, stop.
4. **PNG.** `export_to_image` / `get_canvas_screenshot` broadcast to connected canvas clients,
   so a browser must be attached to the canvas. See below.
5. Verify the file on disk:
   ```bash
   python3 -c "import json;d=json.load(open('NN-slug.excalidraw'));print(len(d['elements']),[e['id'] for e in d['elements']][:4])"
   ```
   Element count and prefix must match what you just created.

### Attaching a browser for PNG export

The Excalidraw frontend at `http://localhost:3333/` has no project switcher: its `hello`
handshake omits `projectId`, so the server drops it into the tenant's oldest project. In a
single-project tenant that is already correct, and a plain headless page load is enough. A
working Playwright host (which also carries the handshake rewrite, harmless in a single-project
tenant but needed if the tenant ever grows a second project) is at:

`/tmp/claude-1000/-home-caleb-source-repos-leverage-workshop-gekko/0234e486-8e45-4082-bbdf-7b7dcad5508d/scratchpad/canvas-host.js`

Run it in the background with `PROJECT_ID=<the-default-project-id>`, wait for the
`CANVAS_OPEN for project …` line in its log, then call the export tool. Re-create the file from
the pattern below if that scratchpad has been cleaned up:

```js
// launch chromium headless at 1920x1200, goto http://localhost:3333/, then hold the page open.
// Before navigation, addInitScript that wraps WebSocket.prototype.send and injects
// `projectId` into any outgoing frame whose type is "hello". Log page console + pageerror.
```

### If you have already polluted a project

`element_history` / `query_elements` on the affected ids show the version chain — v1 is the
original create, v2 your overwrite. Restore by re-issuing the v1 geometry and properties through
`update_element`. Verify with `describe_scene` that the original element count is back.

## Styling conventions used in the reference diagrams

Matching these keeps the four existing diagrams and any new ones looking like one set:

- `roughness: 0` everywhere — clean lines, not the hand-drawn wobble.
- `fontFamily: 5` (Excalifont / the hand font) throughout.
- Title `fontSize: 28`, `strokeColor: #1e1e1e`, at roughly `(40, 30)`.
- Subtitle directly beneath at `fontSize: 16-20`, `strokeColor: #868e96` (grey) — one line
  stating what the diagram claims.
- Zones/groupings as dashed-border rectangles with `backgroundColor: transparent`.
- Callout boxes as filled rectangles, `backgroundColor: #e9ecef`, for the "why it matters" /
  "what is not X" / "the cross-check" asides.
- Canvas width around 1100-1200px so the PNG embeds legibly at document width.
- 27-33 elements is the working range. Past ~40 the diagram is doing too much — split it.

`read_diagram_guide` on the MCP server returns the server's own layout guidance; worth a read
if a diagram's shape is not obvious.
