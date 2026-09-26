#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import {fileURLToPath} from 'url';
import {join, dirname, normalize, resolve, relative, isAbsolute, delimiter} from 'path';
import {existsSync, realpathSync} from 'fs';
import {spawn, execFile, type ChildProcess} from 'child_process';
import {promisify} from 'util';
import {compactJson, SessionLog} from './output.js';
import {TOOLS, validateArguments} from './tools.js';

import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE: boolean = process.env.GODOT_DEBUG === 'true';

const execFileAsync = promisify(execFile);

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface representing a running Godot process
 */
interface GodotProcess {
    process: ChildProcess;
    log: SessionLog;
    running: boolean;
    exitCode: number | null;
}

/**
 * Interface for server configuration
 */
interface GodotServerConfig {
    godotPath?: string;
    debugMode?: boolean;
    godotDebugMode?: boolean;
    strictPathValidation?: boolean; // New option to control path validation behavior
    allowedProjectRoots?: string[];
}

/**
 * Interface for operation parameters
 */
interface OperationParams {
    [key: string]: any;
}

/**
 * Main server class for the Godot MCP server
 */
export class GodotServer {
    private server: Server;
    private activeProcess: GodotProcess | null = null;
    private godotPath: string | null = null;
    private operationsScriptPath: string;
    private validatedPaths: Map<string, boolean> = new Map();
    private strictPathValidation: boolean = false;
    private allowedProjectRoots: string[] = [];
    private godotDebugMode: boolean = GODOT_DEBUG_MODE;

    /**
     * Parameter name mappings between snake_case and camelCase
     * This allows the server to accept both formats
     */
    private parameterMappings: Record<string, string> = {
        project_path: 'projectPath', scene_path: 'scenePath', resource_path: 'resourcePath',
        node_path: 'nodePath', include_properties: 'includeProperties', include_signals: 'includeSignals',
        property_names: 'propertyNames',
    };

    /**
     * Reverse mapping from camelCase to snake_case
     * Generated from parameterMappings for quick lookups
     */
    private reverseParameterMappings: Record<string, string> = {};

    constructor(config?: GodotServerConfig) {
        // Initialize reverse parameter mappings
        for (const [snakeCase, camelCase] of Object.entries(this.parameterMappings)) {
            this.reverseParameterMappings[camelCase] = snakeCase;
        }
        // Apply configuration if provided
        let debugMode = DEBUG_MODE;
        let godotDebugMode = GODOT_DEBUG_MODE;

        if (config) {
            if (config.debugMode !== undefined) {
                debugMode = config.debugMode;
            }
            if (config.godotDebugMode !== undefined) {
                godotDebugMode = config.godotDebugMode;
            }
            if (config.strictPathValidation !== undefined) {
                this.strictPathValidation = config.strictPathValidation;
            }
            if (config.allowedProjectRoots !== undefined) {
                this.allowedProjectRoots = this.normalizeAllowedProjectRoots(config.allowedProjectRoots);
            }

            // Store and validate custom Godot path if provided
            if (config.godotPath) {
                const normalizedPath = normalize(config.godotPath);
                this.godotPath = normalizedPath;
                this.logDebug(`Custom Godot path provided: ${this.godotPath}`);

                // Validate immediately with sync check
                if (!this.isValidGodotPathSync(this.godotPath)) {
                    console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
                    this.godotPath = null; // Reset to trigger auto-detection later
                }
            }
        }
        this.godotDebugMode = godotDebugMode;

        if (this.allowedProjectRoots.length === 0) {
            this.allowedProjectRoots = this.loadAllowedProjectRootsFromEnv();
        }

        // Set the path to the operations script
        this.operationsScriptPath = join(__dirname, 'scripts', 'godot_operations.gd');
        if (debugMode) console.error(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

        // Initialize the MCP server
        this.server = new Server(
            {
                name: 'godot-mcp',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // Set up tool handlers
        this.setupToolHandlers();

        // Error handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);

        // Cleanup on exit
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }

    /**
     * Log debug messages if debug mode is enabled
     * Using stderr instead of stdout to avoid interfering with JSON-RPC communication
     */
    private logDebug(message: string): void {
        if (DEBUG_MODE) {
            console.error(`[DEBUG] ${message}`);
        }
    }

    /**
     * Create a standardized error response with possible solutions
     */
    private createErrorResponse(message: string, solutions: string[] = []): any {
        return {isError: true, content: [{type: 'text', text: compactJson({error: message, ...(solutions[0] ? {hint: solutions[0]} : {})})}]};
    }

    /**
     * Load filesystem roots that MCP tool calls are allowed to touch.
     * Configure one root with GODOT_PROJECT_ROOT or several with GODOT_PROJECT_ROOTS.
     */
    private loadAllowedProjectRootsFromEnv(): string[] {
        const rawRoots = process.env.GODOT_PROJECT_ROOTS ?? process.env.GODOT_PROJECT_ROOT;
        if (!rawRoots) {
            return [];
        }

        return this.normalizeAllowedProjectRoots(rawRoots.split(delimiter));
    }

    private normalizeAllowedProjectRoots(roots: string[]): string[] {
        const normalizedRoots = roots
            .map((root) => root.trim())
            .filter(Boolean)
            .map((root) => this.resolveFilesystemPath(root));

        return Array.from(new Set(normalizedRoots));
    }

    private resolveFilesystemPath(path: string): string {
        const resolved = resolve(normalize(path));
        try {
            return realpathSync.native(resolved);
        } catch {
            return resolved;
        }
    }

    private normalizeForComparison(path: string): string {
        return process.platform === 'win32' ? path.toLowerCase() : path;
    }

    private isWithinAllowedProjectRoots(path: string): boolean {
        const resolvedPath = this.resolveFilesystemPath(path);
        const comparablePath = this.normalizeForComparison(resolvedPath);

        return this.allowedProjectRoots.some((root) => {
            const comparableRoot = this.normalizeForComparison(root);
            if (comparablePath === comparableRoot) {
                return true;
            }

            const relativePath = relative(comparableRoot, comparablePath);
            return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
        });
    }

    private validateFilesystemPath(path: string): string | null {
        if (typeof path !== 'string' || !path.trim() || path.includes('\0')) {
            return null;
        }

        if (this.allowedProjectRoots.length === 0) {
            return null;
        }

        const resolvedPath = this.resolveFilesystemPath(path);
        return this.isWithinAllowedProjectRoots(resolvedPath) ? resolvedPath : null;
    }

    private validateProjectPath(path: string): string | null {
        return this.validateFilesystemPath(path);
    }

    private stripResourcePrefix(path: string): string {
        return path.startsWith('res://') ? path.slice('res://'.length) : path;
    }

    private validatePath(path: string): boolean {
        if (typeof path !== 'string' || !path.trim() || path.includes('\0')) {
            return false;
        }

        const relativePath = this.stripResourcePrefix(path);
        if (
            !relativePath ||
            relativePath.includes('://') ||
            relativePath.includes(':') ||
            isAbsolute(relativePath)
        ) {
            return false;
        }

        const normalizedPath = normalize(relativePath);
        return normalizedPath !== '..' && !normalizedPath.startsWith(`..${'\\'}`) && !normalizedPath.startsWith('../');
    }

    private toProjectRelativePath(path: string): string {
        return this.stripResourcePrefix(path);
    }

    private validateProjectFile(projectPath: string): boolean {
        return existsSync(join(projectPath, 'project.godot'));
    }

    private validateExistingProjectRelativeFile(projectPath: string, filePath: string): boolean {
        return existsSync(join(projectPath, this.toProjectRelativePath(filePath)));
    }

    private extractJsonFromOperationOutput(stdout: string): any | null {
        const lines = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        for (let index = lines.length - 1; index >= 0; index--) {
            const line = lines[index];
            if (!line.startsWith('{') && !line.startsWith('[')) {
                continue;
            }

            try {
                return JSON.parse(line);
            } catch {
                continue;
            }
        }

        return null;
    }

    private stripAnsiCodes(value: string): string {
        return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    }

    private extractValidationStderr(stderr: string): string {
        const startMarker = '[MCP_VALIDATION_START]';
        const endMarker = '[MCP_VALIDATION_END]';
        const startIndex = stderr.lastIndexOf(startMarker);
        if (startIndex < 0) {
            return stderr;
        }

        const contentStart = startIndex + startMarker.length;
        const endIndex = stderr.indexOf(endMarker, contentStart);
        return stderr.slice(contentStart, endIndex >= 0 ? endIndex : undefined);
    }

    private extractGodotScriptDiagnostics(output: string): string[] {
        const diagnostics: string[] = [];
        const lines = this.stripAnsiCodes(output).split(/\r?\n/);
        let pendingDiagnostic: {kind: string; message: string} | null = null;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            const diagnosticMatch = line.match(/^SCRIPT ERROR:\s*(Parse|Compile) Error:\s*(.*)$/);
            if (diagnosticMatch) {
                pendingDiagnostic = {
                    kind: diagnosticMatch[1],
                    message: diagnosticMatch[2]?.trim() || `${diagnosticMatch[1]} error`,
                };
                continue;
            }

            if (!pendingDiagnostic) {
                continue;
            }

            const locationMatch = line.match(/^at:\s*GDScript::reload\s*\((.+):(\d+)\)$/);
            if (locationMatch) {
                const scriptPath = locationMatch[1].endsWith('.mcp_validate')
                    ? locationMatch[1].slice(0, -'.mcp_validate'.length)
                    : locationMatch[1];
                const message = `${pendingDiagnostic.kind} Error: ${pendingDiagnostic.message}`;
                diagnostics.push(`${scriptPath}:${locationMatch[2]}: ${message}`);
                pendingDiagnostic = null;
            }
        }

        return Array.from(new Set(diagnostics));
    }

    private formatValidateProjectOutput(stdout: string, stderr: string, offset = 0, limit = 50): string {
        const parsed = this.extractJsonFromOperationOutput(stdout);
        if (!parsed) {
            return stdout.trim();
        }

        delete parsed.scenes;
        delete parsed.scripts;

        const validationStderr = this.extractValidationStderr(stderr);
        const parseDiagnostics = this.extractGodotScriptDiagnostics(`${stdout}\n${validationStderr}`);
        const diagnosticsByPath = new Map<string, string[]>();
        for (const diagnostic of parseDiagnostics) {
            const match = diagnostic.match(/^(.+):\d+:\s/);
            if (!match) {
                continue;
            }

            const path = match[1];
            const diagnostics = diagnosticsByPath.get(path) ?? [];
            diagnostics.push(diagnostic);
            diagnosticsByPath.set(path, diagnostics);
        }

        const remainingDiagnostics = new Set(parseDiagnostics);
        const rawErrors = Array.isArray(parsed.errors) ? parsed.errors.map(String) : [];
        const errors: string[] = [];

        for (const error of rawErrors) {
            if (/Script failed to parse: Compilation failed \(36\)$/.test(error)) {
                continue;
            }

            const scriptParseMatch = error.match(/^(.+): Script failed to (?:parse|load)/);
            const pathDiagnostics = scriptParseMatch ? diagnosticsByPath.get(scriptParseMatch[1]) : undefined;
            if (pathDiagnostics && pathDiagnostics.length > 0) {
                for (const diagnostic of pathDiagnostics) {
                    errors.push(diagnostic);
                    remainingDiagnostics.delete(diagnostic);
                }
                continue;
            }

            errors.push(error);
        }

        for (const diagnostic of remainingDiagnostics) {
            errors.push(diagnostic);
        }

        for (const line of this.stripAnsiCodes(validationStderr).split(/\r?\n/)) {
            if (/^(SCRIPT ERROR:|ERROR:)/.test(line) && !/^SCRIPT ERROR:\s*(Parse|Compile) Error:/.test(line)) {
                errors.push(line.trim());
            }
        }
        parsed.errors = Array.from(new Set(errors));
        if (parsed.errors.length > 0) {
            parsed.valid = false;
        }

        const warnings = Array.isArray(parsed.warnings) ? [...new Set(parsed.warnings.map(String))] : [];
        const diagnostics = [...parsed.errors.map((message: string) => ({severity: 'error', message})), ...warnings.map(message => ({severity: 'warning', message}))];
        delete parsed.errors;
        delete parsed.warnings;
        return compactJson({
            ...parsed, errorCount: new Set(errors).size, warningCount: warnings.length,
            diagnostics: diagnostics.slice(offset, offset + limit),
            ...(offset + limit < diagnostics.length ? {nextOffset: offset + limit} : {})
        });
    }

    /**
     * Synchronous validation for constructor use
     * This is a quick check that only verifies file existence, not executable validity
     * Full validation will be performed later in detectGodotPath
     * @param path Path to check
     * @returns True if the path exists or is 'godot' (which might be in PATH)
     */
    private isValidGodotPathSync(path: string): boolean {
        try {
            this.logDebug(`Quick-validating Godot path: ${path}`);
            return path === 'godot' || existsSync(path);
        } catch (error) {
            this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
            return false;
        }
    }

    /**
     * Validate if a Godot path is valid and executable
     */
    private async isValidGodotPath(path: string): Promise<boolean> {
        // Check cache first
        if (this.validatedPaths.has(path)) {
            return this.validatedPaths.get(path)!;
        }

        try {
            this.logDebug(`Validating Godot path: ${path}`);

            // Check if the file exists (skip for 'godot' which might be in PATH)
            if (path !== 'godot' && !existsSync(path)) {
                this.logDebug(`Path does not exist: ${path}`);
                this.validatedPaths.set(path, false);
                return false;
            }

            // Try to execute Godot with --version flag
            // Using execFileAsync with argument array to prevent command injection
            await execFileAsync(path, ['--version']);

            this.logDebug(`Valid Godot path: ${path}`);
            this.validatedPaths.set(path, true);
            return true;
        } catch (error) {
            this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
            this.validatedPaths.set(path, false);
            return false;
        }
    }

    /**
     * Detect the Godot executable path based on the operating system
     */
    private async detectGodotPath() {
        // If godotPath is already set and valid, use it
        if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
            this.logDebug(`Using existing Godot path: ${this.godotPath}`);
            return;
        }

        // Check environment variable next
        if (process.env.GODOT_PATH) {
            const normalizedPath = normalize(process.env.GODOT_PATH);
            this.logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
            if (await this.isValidGodotPath(normalizedPath)) {
                this.godotPath = normalizedPath;
                this.logDebug(`Using Godot path from environment: ${this.godotPath}`);
                return;
            } else {
                this.logDebug(`GODOT_PATH environment variable is invalid`);
            }
        }

        // Auto-detect based on platform
        const osPlatform = process.platform;
        this.logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);

        const possiblePaths: string[] = [
            'godot', // Check if 'godot' is in PATH first
        ];

        // Add platform-specific paths
        if (osPlatform === 'darwin') {
            possiblePaths.push(
                '/Applications/Godot.app/Contents/MacOS/Godot',
                '/Applications/Godot_4.app/Contents/MacOS/Godot',
                `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
                `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
                `${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`
            );
        } else if (osPlatform === 'win32') {
            possiblePaths.push(
                'C:\\Program Files\\Godot\\Godot.exe',
                'C:\\Program Files (x86)\\Godot\\Godot.exe',
                'C:\\Program Files\\Godot_4\\Godot.exe',
                'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
                `${process.env.USERPROFILE}\\Godot\\Godot.exe`
            );
        } else if (osPlatform === 'linux') {
            possiblePaths.push(
                '/usr/bin/godot',
                '/usr/local/bin/godot',
                '/snap/bin/godot',
                `${process.env.HOME}/.local/bin/godot`
            );
        }

        // Try each possible path
        for (const path of possiblePaths) {
            const normalizedPath = normalize(path);
            if (await this.isValidGodotPath(normalizedPath)) {
                this.godotPath = normalizedPath;
                this.logDebug(`Found Godot at: ${normalizedPath}`);
                return;
            }
        }

        // If we get here, we couldn't find Godot
        this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
        console.error(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
        console.error(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

        if (this.strictPathValidation) {
            // In strict mode, throw an error
            throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
        } else {
            // Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
            if (osPlatform === 'win32') {
                this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
            } else if (osPlatform === 'darwin') {
                this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
            } else {
                this.godotPath = normalize('/usr/bin/godot');
            }

            this.logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
            console.error(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
            console.error(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
        }
    }

    /**
     * Set a custom Godot path
     * @param customPath Path to the Godot executable
     * @returns True if the path is valid and was set, false otherwise
     */
    public async setGodotPath(customPath: string): Promise<boolean> {
        if (!customPath) {
            return false;
        }

        // Normalize the path to ensure consistent format across platforms
        // (e.g., backslashes to forward slashes on Windows, resolving relative paths)
        const normalizedPath = normalize(customPath);
        if (await this.isValidGodotPath(normalizedPath)) {
            this.godotPath = normalizedPath;
            this.logDebug(`Godot path set to: ${normalizedPath}`);
            return true;
        }

        this.logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
        return false;
    }

    /**
     * Clean up resources when shutting down
     */
    private async cleanup() {
        this.logDebug('Cleaning up resources');
        if (this.activeProcess) {
            this.logDebug('Killing active Godot process');
            this.activeProcess.process.kill();
            this.activeProcess = null;
        }
        await this.server.close();
    }

    /**
     * Normalize parameters to camelCase format
     * @param params Object with either snake_case or camelCase keys
     * @returns Object with all keys in camelCase format
     */
    private normalizeParameters(params: OperationParams): OperationParams {
        if (!params || typeof params !== 'object') {
            return params;
        }

        const result: OperationParams = {};

        for (const key in params) {
            if (Object.prototype.hasOwnProperty.call(params, key)) {
                let normalizedKey = key;

                // If the key is in snake_case, convert it to camelCase using our mapping
                if (key.includes('_') && this.parameterMappings[key]) {
                    normalizedKey = this.parameterMappings[key];
                }

                // Handle nested objects recursively
                if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
                    result[normalizedKey] = this.normalizeParameters(params[key] as OperationParams);
                } else {
                    result[normalizedKey] = params[key];
                }
            }
        }

        return result;
    }

    /**
     * Convert camelCase keys to snake_case
     * @param params Object with camelCase keys
     * @returns Object with snake_case keys
     */
    private convertCamelToSnakeCase(params: OperationParams): OperationParams {
        const result: OperationParams = {};

        for (const key in params) {
            if (Object.prototype.hasOwnProperty.call(params, key)) {
                // Convert camelCase to snake_case
                const snakeKey = this.reverseParameterMappings[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

                // Handle nested objects recursively
                if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
                    result[snakeKey] = this.convertCamelToSnakeCase(params[key] as OperationParams);
                } else {
                    result[snakeKey] = params[key];
                }
            }
        }

        return result;
    }

    /**
     * Execute a Godot operation using the operations script
     * @param operation The operation to execute
     * @param params The parameters for the operation
     * @param projectPath The path to the Godot project
     * @returns The stdout and stderr from the operation
     */
    private async executeOperation(
        operation: string,
        params: OperationParams,
        projectPath: string
    ): Promise<{ stdout: string; stderr: string }> {
        const validatedProjectPath = this.validateProjectPath(projectPath);
        if (!validatedProjectPath) {
            throw new Error('Project path is outside the configured GODOT_PROJECT_ROOT allowlist');
        }
        projectPath = validatedProjectPath;

        this.logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
        this.logDebug(`Original operation params: ${JSON.stringify(params)}`);

        // Convert camelCase parameters to snake_case for Godot script
        const snakeCaseParams = this.convertCamelToSnakeCase(params);
        this.logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);


        // Ensure godotPath is set
        if (!this.godotPath) {
            await this.detectGodotPath();
            if (!this.godotPath) {
                throw new Error('Could not find a valid Godot executable path');
            }
        }

        try {
            // Serialize the snake_case parameters to a valid JSON string
            const paramsJson = JSON.stringify(snakeCaseParams);

            // Build argument array for execFile to prevent command injection
            // Using execFile with argument arrays avoids shell interpretation entirely
            const args = [
                '--headless',
                '--path',
                projectPath,  // Safe: passed as argument, not interpolated into shell command
                '--script',
                this.operationsScriptPath,
                operation,
                paramsJson,  // Safe: passed as argument, not interpreted by shell
            ];


            if (this.godotDebugMode) {
                args.push('--debug-godot');
            }

            this.logDebug(`Executing: ${this.godotPath} ${args.join(' ')}`);

            const {stdout, stderr} = await execFileAsync(this.godotPath!, args, {timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true});

            return {stdout: stdout ?? '', stderr: stderr ?? ''};
        } catch (error: unknown) {
            const failure = error as Error & { stdout?: string; stderr?: string };
            throw new Error((failure.stderr || failure.message || 'Godot operation failed').slice(0, 4000));
        }
    }

    /**
     * Set up the tool handlers for the MCP server
     */
    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({tools: TOOLS}));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const name = request.params.name;
            if (!TOOLS.some(tool => tool.name === name)) {
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
            }
            const args = this.normalizeParameters(request.params.arguments ?? {});
            const invalid = validateArguments(name, args);
            if (invalid) return this.createErrorResponse(invalid);
            try {
                if (name === 'get_debug_output') return this.handleGetDebugOutput(args);
                if (name === 'stop_project') return await this.handleStopProject();
                const projectPath = this.validateProjectPath(args.projectPath);
                if (!projectPath || !this.validateProjectFile(projectPath)) {
                    return this.createErrorResponse('Project must contain project.godot and be inside GODOT_PROJECT_ROOT(S).');
                }
                args.projectPath = projectPath;
                for (const key of ['scene', 'scenePath', 'resourcePath']) {
                    if (args[key] !== undefined && (!this.validatePath(args[key]) || !this.validateExistingProjectRelativeFile(projectPath, args[key]))) {
                        return this.createErrorResponse(`Invalid or missing project file: ${key}`);
                    }
                }
                if (name === 'run_project') return await this.handleRunProject(args);
                const {projectPath: _, ...params} = args;
                const {stdout, stderr} = await this.executeOperation(name, params, projectPath);
                if (!this.extractJsonFromOperationOutput(stdout)) {
                    return this.createErrorResponse(stderr || 'Godot returned no result.');
                }
                if (name.startsWith('validate_')) {
                    const text = this.formatValidateProjectOutput(stdout, stderr, args.offset ?? 0, args.limit ?? 50);
                    const result = JSON.parse(text);
                    return {content: [{type: 'text' as const, text}], ...((result.result ?? result).valid === false ? {isError: true} : {})};
                }
                const result = this.extractJsonFromOperationOutput(stdout);
                // Engine errors must not disappear behind an otherwise valid JSON result.
                if (stderr.trim()) result.engineDiagnostics = stderr.trim();
                return this.jsonResponse(result);
            } catch (error) {
                return this.createErrorResponse(error instanceof Error ? error.message : String(error));
            }
        });
    }

    private jsonResponse(value: unknown) {
        return {content: [{type: 'text' as const, text: compactJson(value)}]};
    }

    private async handleRunProject(args: any) {
        if (this.activeProcess?.running) return this.createErrorResponse('A managed session is running. Stop it before starting another.');
        if (!this.godotPath) await this.detectGodotPath();
        if (!this.godotPath) return this.createErrorResponse('Godot not found. Set GODOT_PATH.');
        const commandArgs = ['-d', '--path', args.projectPath];
        if (args.headless !== false) commandArgs.unshift('--headless');
        if (args.scene) commandArgs.push('res://' + this.toProjectRelativePath(args.scene));
        const child = spawn(this.godotPath, commandArgs, {stdio: 'pipe', windowsHide: true});
        const session: GodotProcess = {process: child, log: new SessionLog(), running: true, exitCode: null};
        this.activeProcess = session;
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => session.log.append('stdout', chunk));
        child.stderr?.on('data', (chunk: string) => session.log.append('stderr', chunk));
        child.on('close', code => {
            session.log.flush();
            session.running = false;
            session.exitCode = code;
        });
        child.on('error', error => {
            session.log.append('stderr', error.message + '\n');
            session.running = false;
        });
        await new Promise<void>((resolve, reject) => {
            child.once('spawn', resolve);
            child.once('error', reject);
        });
        return this.jsonResponse({status: 'started', headless: args.headless !== false});
    }

    private handleGetDebugOutput(args: any) {
        const session = this.activeProcess;
        if (!session) return this.createErrorResponse('No managed session. Use run_project first.');
        // SessionLog already applies its response budget; do not truncate cursor pages again.
        return {
            content: [{
                type: 'text' as const, text: JSON.stringify({
                    running: session.running,
                    exitCode: session.exitCode, ...session.log.read(args.limit, args.cursor)
                })
            }]
        };
    }

    private async handleStopProject() {
        const session = this.activeProcess;
        if (!session?.running) return this.jsonResponse({status: 'stopped'});
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                session.process.off('close', done);
                reject(new Error('Godot did not stop within 5 seconds.'));
            }, 5000);
            const done = () => {
                clearTimeout(timer);
                resolve();
            };
            session.process.once('close', done);
            session.process.kill();
        });
        return this.jsonResponse({status: 'stopped', exitCode: session.exitCode});
    }


    /**
     * Run the MCP server
     */
    async run() {
        try {
            // Detect Godot path before starting the server
            await this.detectGodotPath();

            if (!this.godotPath) {
                console.error('[SERVER] Failed to find a valid Godot executable path');
                console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
                process.exit(1);
            }

            // Check if the path is valid
            const isValid = await this.isValidGodotPath(this.godotPath);

            if (!isValid) {
                if (this.strictPathValidation) {
                    // In strict mode, exit if the path is invalid
                    console.error(`[SERVER] Invalid Godot path: ${this.godotPath}`);
                    console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
                    process.exit(1);
                } else {
                    // In compatibility mode, warn but continue with the default path
                    console.error(`[SERVER] Warning: Using potentially invalid Godot path: ${this.godotPath}`);
                    console.error('[SERVER] This may cause issues when executing Godot commands');
                    console.error('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
                }
            }

            console.error(`[SERVER] Using Godot at: ${this.godotPath}`);
            if (this.allowedProjectRoots.length > 0) {
                console.error(`[SERVER] Allowed project roots: ${this.allowedProjectRoots.join(', ')}`);
            } else {
                console.error('[SERVER] No project roots configured. Project tools will reject requests until GODOT_PROJECT_ROOT or GODOT_PROJECT_ROOTS is set.');
            }

            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error('Godot MCP server running on stdio');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[SERVER] Failed to start:', errorMessage);
            process.exit(1);
        }
    }
}

// Importing the server for tests must not open a stdio transport.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
    const server = new GodotServer();
    server.run().catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to run server:', errorMessage);
        process.exit(1);
    });

}
