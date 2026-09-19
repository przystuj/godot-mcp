# Godot MCP for Codex in Rider

Seven tools for feedback that requires the Godot engine. Use Codex and Rider for source edits, search, refactoring, builds, and debugging. This server operates on saved files and its own play session; it does not attach to the open Godot editor or Rider debugger.

## Tools

| Tool | Purpose |
|------|---------|
| `inspect_scene` | Load a saved scene and inspect resolved nodes, including instantiated child scenes. Filter by `nodePath`; request properties and signal connections explicitly. |
| `inspect_resource` | Inspect engine-loaded resources, including binary/imported resources. Defaults to type and stored property names; request values with `propertyNames` or `includeProperties`. |
| `validate_scene` | Load, instantiate, and repack a scene in memory without saving it. |
| `validate_project` | Validate saved scenes and GDScript. Return counts and diagnostics with file/line parse errors. Use Rider/build tools for C#. |
| `run_project` | Start one managed play session, optionally a specific `scene`. Defaults to `headless: true`; set it to `false` for a game window. |
| `get_debug_output` | Read new stdout/stderr lines, process status, and exit code. Logs survive exit and stop. |
| `stop_project` | Stop the managed session without replaying logs. |

Project operations require `projectPath`. Scene/resource paths may be project-relative or start with `res://`. Snake-case aliases for camel-case path and inspection arguments remain accepted.

Inspection loads a fresh scene/resource; it does not report live game state or run the gameplay loop. Loading and instantiation can execute project code. Allowed roots restrict tool targets, not the capabilities of that code.

## Response limits

- Inspection and validation accept `offset` and `limit` (default 50, maximum 200), with `nextOffset` when more results exist. Scene nodes are a flat list with paths; resource pages contain property names or values; validation pages contain diagnostics with full error/warning counts.
- Properties and signal connections are opt-in. `propertyNames` selects specific values and overrides `includeProperties`.
- Validation returns counts and diagnostics, without per-file success records. Failed validation sets the MCP result's `isError` flag.
- JSON is compact and responses stay below 16,000 characters. Oversized engine data is wrapped as `{ result, truncated: true, omitted, hint }`. Narrow the subtree, property selection, or page size when this occurs. Long individual values may be shortened.
- Logs retain the latest 1,000 nonempty lines, capped at 2,048 characters plus a truncation marker per line (less for heavily escaped text). Reads default to 50 lines, allow at most 100, and obey a size budget. Lines have `id`, `stream`, and `text`.
- Log reads return `nextCursor` and `hasMore`. Omit `cursor` to consume unread lines; pass a previous cursor to replay. `cursor: 0` starts at the oldest retained line. `dropped` reports evicted lines. Starting another session resets history and cursors.
- Inspection/validation operations have a 60-second timeout and a 4 MiB capture limit. Play sessions run until they exit or are stopped.

Example arguments for `inspect_scene`:

```json
{
  "projectPath": "S:/Dev/MyGame",
  "scenePath": "scenes/player.tscn",
  "nodePath": "root",
  "propertyNames": ["position"],
  "limit": 1
}
```

## Build and connect

Requires Godot 4.x, Node.js 18 or newer, and npm. From this package directory:

```sh
npm ci
npm run build
```

Configure your MCP client to launch this local build over stdio:

| Setting | Value |
|---------|-------|
| Command | `node` or the full path to `node.exe` |
| Arguments | Absolute path to this checkout's `build/index.js` |
| Environment | `GODOT_PATH` and `GODOT_PROJECT_ROOT` as below |

Use the local build to get the reduced tool set. Restart the MCP connection after rebuilding to refresh cached tools.

| Variable | Purpose |
|----------|---------|
| `GODOT_PATH` | Godot executable. Otherwise PATH and common installation locations are checked. |
| `GODOT_PROJECT_ROOT` | Required allowed project directory, or parent containing trusted projects. |
| `GODOT_PROJECT_ROOTS` | Multiple allowed roots separated by `;` on Windows or `:` elsewhere. Overrides `GODOT_PROJECT_ROOT`. |
| `DEBUG` | Set to `true` for server diagnostics on stderr. |
| `GODOT_DEBUG` | Set to `true` for bundled operation diagnostics; off by default. |

## Migration

Editing, project discovery/metadata, editor launch, standalone version/UID, import-metadata, and static asset-scanning tools have been removed from discovery and dispatch. Use source edits, Rider, the Godot editor, or the shell for those tasks. One-shot input, method-call, signal-wait, and runtime-tree tools were also removed: they did not control the managed game session.

This intentionally breaks the old interface. Scene inspection returns paged `nodes`; validation returns paged `diagnostics`; debug output returns cursor-based `lines` instead of replaying stdout/stderr arrays.

## Verification

```sh
npm test
```

Tests cover the tool surface, argument validation, response bounds, and log retention/cursors. Set `GODOT_PATH` to also run the MCP stdio integration test against the engine in a temporary project. It checks inspection, validation failures, path restrictions, removed tools, and session lifecycle. Without that variable, the engine test is explicitly skipped.

## License

[MIT](LICENSE).
