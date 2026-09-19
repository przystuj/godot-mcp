const projectPath = {type: 'string', description: 'Godot project directory inside the configured roots.'};
const scenePath = {type: 'string', description: 'Project-relative scene path or res:// path.'};
const page = {
    offset: {type: 'integer', minimum: 0, default: 0},
    limit: {type: 'integer', minimum: 1, maximum: 200, default: 50},
};
const properties = {
    includeProperties: {type: 'boolean', default: false},
    propertyNames: {type: 'array', items: {type: 'string'}, maxItems: 50, description: 'Read only these properties; overrides includeProperties.'},
};

function tool(name: string, description: string, fields: Record<string, any>, required: string[] = []) {
    return {name, description, inputSchema: {type: 'object' as const, properties: fields, required, additionalProperties: false}};
}

export const TOOLS = [
    tool('run_project', 'Start one managed Godot play session and capture logs. Does not attach to Rider or an existing editor session.', {
        projectPath, scene: scenePath, headless: {type: 'boolean', default: true},
    }, ['projectPath']),
    tool('get_debug_output', 'Read new session log lines, including after exit. Returns nextCursor, hasMore and dropped-line count when needed.', {
        cursor: {type: 'integer', minimum: 0, description: 'Omit for unread lines; use 0 to replay retained logs.'},
        limit: {type: 'integer', minimum: 1, maximum: 100, default: 50},
    }),
    tool('stop_project', 'Stop the managed play session. Logs remain available through get_debug_output.', {}),
    tool('inspect_scene', 'Load a saved scene with Godot; page through resolved nodes. Does not inspect a running game. Properties and signal connections are opt-in.', {
        projectPath, scenePath, nodePath: {type: 'string', description: 'Optional subtree, e.g. root/Player.'},
        ...properties, includeSignals: {type: 'boolean', default: false}, ...page,
    }, ['projectPath', 'scenePath']),
    tool('inspect_resource', 'Load a Godot resource, including binary/imported resources. Returns type and property names; request values explicitly.', {
        projectPath, resourcePath: {type: 'string', description: 'Project-relative resource path or res:// path.'},
        ...properties, ...page,
    }, ['projectPath', 'resourcePath']),
    tool('validate_scene', 'Check that Godot can load, instantiate and repack a saved scene without saving it. Returns paged diagnostics.', {
        projectPath, scenePath, ...page,
    }, ['projectPath', 'scenePath']),
    tool('validate_project', 'Validate saved scenes and GDScript with Godot. Returns counts and paged diagnostics. Use Rider/build tools for C#.', {
        projectPath, ...page,
    }, ['projectPath']),
];

/** Validate tool input on the server; MCP clients need not enforce JSON Schema. */
export function validateArguments(name: string, args: Record<string, any>): string | undefined {
    const spec = TOOLS.find(tool => tool.name === name);
    if (!spec) return `Unknown tool: ${name}`;
    for (const key of spec.inputSchema.required) {
        if (args[key] === undefined) return `${key} is required`;
    }
    for (const [key, value] of Object.entries(args)) {
        const field = spec.inputSchema.properties[key];
        if (!field) return `Unknown argument: ${key}`;
        if (field.type === 'integer') {
            if (!Number.isSafeInteger(value) || value < field.minimum || (field.maximum !== undefined && value > field.maximum)) return `Invalid ${key}`;
        } else if (field.type === 'array') {
            if (!Array.isArray(value) || value.length > field.maxItems || !value.every(v => typeof v === 'string' && v.length > 0 && v.length <= 256)) return `Invalid ${key}`;
        } else if (typeof value !== field.type || (field.type === 'string' && (!value.trim() || value.length > 4096 || value.includes('\0')))) {
            return `Invalid ${key}`;
        }
    }
}
