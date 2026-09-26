import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {compactJson, SessionLog} from '../build/output.js';
import {TOOLS, validateArguments} from '../build/tools.js';

test('bounded responses remain valid JSON and disclose omitted data', () => {
    const value = {valid: false, diagnostics: Array.from({length: 10000}, () => ({message: 'x'.repeat(10000)}))};
    const text = compactJson(value);
    assert.ok(text.length < 16000);
    const result = JSON.parse(text);
    assert.equal(result.truncated, true);
    assert.equal(result.result.valid, false);
    assert.ok(result.omitted.length);
    assert.equal(compactJson({valid: true, sceneCount: 2}), '{"valid":true,"sceneCount":2}');
});

test('logs handle chunks, cursors, replay, overflow and oversized lines', () => {
    const log = new SessionLog();
    log.append('stdout', 'hel');
    log.append('stdout', 'lo\n\n');
    log.append('stderr', '\x1b[31mproblem\x1b[0m\n');
    assert.deepEqual(log.read(1).lines.map(line => line.text), ['hello']);
    assert.deepEqual(log.read().lines.map(line => line.text), ['problem']);
    assert.equal(log.read().lines.length, 0);
    assert.equal(log.read(50, 0).lines.length, 2);
    for (let i = 0; i < 1100; i++) log.append('stdout', `${i}\n`);
    const overflow = log.read(100, 0);
    assert.equal(overflow.dropped, 102);
    assert.equal(overflow.hasMore, true);
    log.append('stderr', 'x'.repeat(100000));
    log.flush();
    let page;
    do {
        page = log.read(100);
        assert.ok(JSON.stringify(page).length < 12000);
    } while (page.hasMore);
    assert.match(page.lines.at(-1).text, /truncated/);
});

test('tool surface stays small and rejects malformed arguments', () => {
    assert.deepEqual(TOOLS.map(tool => tool.name).sort(), [
        'run_project', 'stop_project', 'get_debug_output', 'inspect_scene', 'inspect_resource', 'validate_scene', 'validate_project',
    ].sort());
    assert.ok(JSON.stringify(TOOLS).length < 7000);
    assert.ok(validateArguments('get_debug_output', {limit: -1}));
    assert.ok(validateArguments('get_debug_output', {limit: 1.5}));
    assert.ok(validateArguments('get_debug_output', {unexpected: true}));
    assert.ok(validateArguments('inspect_scene', {projectPath: 'p', scenePath: 's', propertyNames: [1]}));
    assert.equal(validateArguments('get_debug_output', {limit: 50}), undefined);
});

test('Godot inspection script includes its node path resolver', async () => {
    const script = await readFile(resolve('build/scripts/godot_operations.gd'), 'utf8');
    assert.match(script, /^func get_scene_node\(scene_root, node_path\):$/m);
    assert.match(script, /var selected_root = get_scene_node\(scene_root, params\.get\("node_path", "root"\)\)/);
});

test('Godot MCP integration: inspection, validation, removed tools and session lifecycle', {
    skip: !process.env.GODOT_PATH && 'Set GODOT_PATH to run engine integration checks', timeout: 60000,
}, async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-test-'));
    const client = new Client({name: 'test', version: '1'});
    const serverEnv = {...process.env, GODOT_PROJECT_ROOT: projectPath};
    delete serverEnv.GODOT_PROJECT_ROOTS;
    const transport = new StdioClientTransport({
        command: process.execPath, args: [resolve('build/index.js')],
        env: serverEnv, stderr: 'pipe'
    });
    let serverErrors = '';
    transport.stderr?.on('data', data => {
        serverErrors += data.toString();
    });
    const invoke = async (name, args = {}, expectError = false) => {
        const response = await client.callTool({name, arguments: args});
        assert.equal(Boolean(response.isError), expectError, JSON.stringify(response));
        assert.ok(response.content[0].text.length < 16000);
        return JSON.parse(response.content[0].text);
    };
    try {
        await writeFile(join(projectPath, 'project.godot'), 'config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n[autoload]\nGlobals="*res://globals.gd"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
        await writeFile(join(projectPath, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Root" type="Node2D"]\nscript = ExtResource("1")\n[node name="Child" type="Node2D" parent="."]\nposition = Vector2(10, 20)\n');
        await writeFile(join(projectPath, 'globals.gd'), 'extends Node\nvar value = "autoload available"\nfunc _ready():\n    push_error("autoload runtime noise")\n');
        await writeFile(join(projectPath, 'main.gd'), 'extends Node2D\nfunc _ready():\n    print(Globals.value)\n    print("session complete")\n    get_tree().quit()\n');
        await writeFile(join(projectPath, 'material.tres'), '[gd_resource type="StandardMaterial3D" format=3]\n[resource]\nroughness = 0.25\n');
        await client.connect(transport);
        assert.equal((await client.listTools()).tools.length, 7);
        await assert.rejects(client.callTool({name: 'send_input_action', arguments: {}}), /Unknown tool/);
        await invoke('inspect_scene', {projectPath, scenePath: '../outside.tscn'}, true);
        await invoke('inspect_scene', {projectPath: tmpdir(), scenePath: 'main.tscn'}, true);
        const page = await invoke('inspect_scene', {projectPath, scenePath: 'main.tscn', limit: 1});
        assert.equal(page.nodeCount, 2);
        assert.equal(page.nextOffset, 1);
        assert.equal(page.nodes.length, 1);
        assert.equal(page.nodes[0].properties, undefined);
        const node = await invoke('inspect_scene', {projectPath, scenePath: 'main.tscn', nodePath: 'root/Child', propertyNames: ['position']});
        assert.equal(node.nodes[0].properties.position.x, 10);
        assert.equal(node.nodes[0].properties.position.y, 20);
        const resource = await invoke('inspect_resource', {projectPath, resourcePath: 'material.tres'});
        assert.equal(resource.type, 'StandardMaterial3D');
        assert.equal(resource.properties, undefined);
        const property = await invoke('inspect_resource', {projectPath, resourcePath: 'material.tres', propertyNames: ['roughness']});
        assert.equal(property.properties.roughness, 0.25);
        assert.equal((await invoke('validate_scene', {projectPath, scenePath: 'main.tscn'})).valid, true);
        const valid = await invoke('validate_project', {projectPath});
        assert.equal(valid.valid, true);
        assert.equal(valid.scriptCount, 2);
        assert.equal(valid.scenes, undefined);
        await writeFile(join(projectPath, 'broken.gd'), 'extends Node\nfunc broken(:\n');
        const invalid = await invoke('validate_project', {projectPath, limit: 1}, true);
        assert.equal(invalid.valid, false);
        assert.match(invalid.diagnostics[0].message, /broken.gd:2: Parse Error:/);
        await invoke('run_project', {projectPath});
        let log;
        const deadline = Date.now() + 10000;
        do {
            await new Promise(resolve => setTimeout(resolve, 50));
            log = await invoke('get_debug_output', {cursor: 0});
        } while (log.running && Date.now() < deadline);
        assert.equal(log.running, false);
        assert.ok(log.lines.some(line => line.text === 'session complete'));
        assert.equal((await invoke('get_debug_output')).lines.length, 0);
        await writeFile(join(projectPath, 'main.gd'), 'extends Node2D\nfunc _ready():\n    print("session running")\n');
        await invoke('run_project', {projectPath});
        await invoke('run_project', {projectPath}, true);
        await invoke('stop_project');
        assert.equal((await invoke('get_debug_output')).running, false);
    } catch (error) {
        error.message += '\nServer stderr: ' + serverErrors;
        throw error;
    } finally {
        await client.close();
        await transport.close();
        // Only remove the uniquely created test project under the OS temporary directory.
        assert.equal(resolve(projectPath, '..'), resolve(tmpdir()));
        assert.ok(projectPath.includes('godot-mcp-test-'));
        await rm(projectPath, {recursive: true, force: true});
    }
});
