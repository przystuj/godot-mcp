# Contributing

Keep this server focused on capabilities that require Godot and complement development with Codex in Rider. File search, source editing, refactoring, and shell command wrappers do not need additional MCP tools. Prefer a focused option on an existing tool over a new tool for a closely related task.

## Development

1. Install dependencies with `npm ci`.
2. Build with `npm run build`, or use `npm run watch` for TypeScript changes. Rebuild to copy GDScript changes.
3. Run `npm test`. Set `GODOT_PATH` to include the real-engine integration check.
4. Update the README for changes to arguments, output, or behavior.

## Source layout

- `src/tools.ts`: the public tool catalog and argument validation.
- `src/index.ts`: MCP dispatch, process lifecycle, path checks, and engine diagnostic parsing.
- `src/output.ts`: response bounds and cursor-based session logs.
- `src/scripts/godot_operations.gd`: engine inspection and validation operations.
- `tests/server.test.mjs`: response/log tests and real-engine MCP integration.
- `build/`: generated package output.

Keep descriptions short and responses bounded. Inspection should default to summaries with explicit detail selection and pagination. Preserve error counts and actionable file/line diagnostics. Check process failures and engine diagnostics even when an operation prints JSON.

Use `DEBUG=true` for server diagnostics or `npm run inspector` for interactive MCP requests. Include a minimal reproduction, engine version, and relevant diagnostic output when reporting bugs.
