#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Debug mode flag
var debug_mode = false

func _init():
    var args = OS.get_cmdline_args()

    # Check for debug flag
    debug_mode = "--debug-godot" in args

    # Find the script argument and determine the positions of operation and params
    var script_index = args.find("--script")
    if script_index == -1:
        log_error("Could not find --script argument")
        quit(1)

    # The operation should be 2 positions after the script path (script_index + 1 is the script path itself)
    var operation_index = script_index + 2
    # The params should be 3 positions after the script path
    var params_index = script_index + 3

    if args.size() <= params_index:
        log_error("Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
        log_error("Not enough command-line arguments provided.")
        quit(1)

    # Log all arguments for debugging
    log_debug("All arguments: " + str(args))
    log_debug("Script index: " + str(script_index))
    log_debug("Operation index: " + str(operation_index))
    log_debug("Params index: " + str(params_index))

    var operation = args[operation_index]
    var params_json = args[params_index]

    log_info("Operation: " + operation)
    log_debug("Params JSON: " + params_json)

    # Parse JSON using Godot 4.x API
    var json = JSON.new()
    var error = json.parse(params_json)
    var params = null

    if error == OK:
        params = json.get_data()
    else:
        log_error("Failed to parse JSON parameters: " + params_json)
        log_error("JSON Error: " + json.get_error_message() + " at line " + str(json.get_error_line()))
        quit(1)

    if params == null:
        log_error("Failed to parse JSON parameters: " + params_json)
        quit(1)

    log_info("Executing operation: " + operation)

    match operation:
        "inspect_scene":
            inspect_scene(params)
        "inspect_resource":
            inspect_resource(params)
        "validate_scene":
            validate_scene(params)
        "validate_project":
            validate_project(params)
        _:
            log_error("Unknown operation: " + operation)
            quit(1)
            return
    quit()

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    log_debug("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

func to_res_path(path):
    var res_path = str(path)
    if not res_path.begins_with("res://"):
        res_path = "res://" + res_path
    return res_path

func print_json(value):
    print(JSON.stringify(value))

func get_mcp_node_path(scene_root, node):
    if node == scene_root:
        return "root"
    return "root/" + str(scene_root.get_path_to(node))

func error_name(error_code):
    if error_code == OK:
        return "OK"
    return str(error_code)

func variant_to_json(value, depth:=0):
    if depth > 4:
        return str(value)

    match typeof(value):
        TYPE_NIL:
            return null
        TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
            return value
        TYPE_STRING_NAME:
            return str(value)
        TYPE_NODE_PATH:
            return {
                    "type": "NodePath",
                    "path": str(value)
            }
        TYPE_VECTOR2:
            return {
                    "type": "Vector2",
                    "x": value.x,
                    "y": value.y
            }
        TYPE_VECTOR2I:
            return {
                    "type": "Vector2i",
                    "x": value.x,
                    "y": value.y
            }
        TYPE_VECTOR3:
            return {
                    "type": "Vector3",
                    "x": value.x,
                    "y": value.y,
                    "z": value.z
            }
        TYPE_VECTOR3I:
            return {
                    "type": "Vector3i",
                    "x": value.x,
                    "y": value.y,
                    "z": value.z
            }
        TYPE_VECTOR4:
            return {
                    "type": "Vector4",
                    "x": value.x,
                    "y": value.y,
                    "z": value.z,
                    "w": value.w
            }
        TYPE_VECTOR4I:
            return {
                    "type": "Vector4i",
                    "x": value.x,
                    "y": value.y,
                    "z": value.z,
                    "w": value.w
            }
        TYPE_RECT2:
            return {
                    "type": "Rect2",
                    "position": variant_to_json(value.position, depth + 1),
                    "size": variant_to_json(value.size, depth + 1)
            }
        TYPE_RECT2I:
            return {
                    "type": "Rect2i",
                    "position": variant_to_json(value.position, depth + 1),
                    "size": variant_to_json(value.size, depth + 1)
            }
        TYPE_COLOR:
            return {
                    "type": "Color",
                    "r": value.r,
                    "g": value.g,
                    "b": value.b,
                    "a": value.a
            }
        TYPE_ARRAY:
            var array_result = []
            for item in value:
                array_result.append(variant_to_json(item, depth + 1))
            return array_result
        TYPE_DICTIONARY:
            var dictionary_result = {}
            for key in value.keys():
                dictionary_result[str(key)] = variant_to_json(value[key], depth + 1)
            return dictionary_result
        TYPE_OBJECT:
            if value == null:
                return null
            if value is Resource:
                return {
                        "type": value.get_class(),
                        "resourcePath": value.resource_path
                }
            if value is Node:
                return {
                        "type": value.get_class(),
                        "name": value.name,
                        "path": str(value.get_path())
                }
            return {
                    "type": value.get_class(),
                    "value": str(value)
            }
        _:
            return str(value)

func append_scene_nodes(node, nodes):
    nodes.append(node)
    for child in node.get_children():
        append_scene_nodes(child, nodes)

func connection_to_json(scene_root, source_node, signal_name, connection):
    var callable = connection.get("callable", null)
    var target = null
    var method_name = ""

    if typeof(callable) == TYPE_CALLABLE and callable.is_valid():
        target = callable.get_object()
        method_name = str(callable.get_method())

    var target_path = ""
    if target is Node:
        target_path = get_mcp_node_path(scene_root, target)

    return {
            "sourcePath": get_mcp_node_path(scene_root, source_node),
            "signalName": str(signal_name),
            "targetPath": target_path,
            "methodName": method_name,
            "flags": int(connection.get("flags", 0))
    }

func node_to_inspection(scene_root, node, include_properties, property_names, include_signals):
    var node_data = {
            "name": str(node.name),
            "path": get_mcp_node_path(scene_root, node),
            "type": node.get_class()
    }

    var script = node.get_script()
    if script:
        node_data["script"] = variant_to_json(script)

    var groups = []
    for group in node.get_groups():
        groups.append(str(group))
    if not groups.is_empty():
        node_data["groups"] = groups

    if include_properties or property_names.size() > 0:
        var properties = {}
        for property in node.get_property_list():
            var property_name = str(property.name)
            var usage = int(property.get("usage", 0))
            var should_include_property = property_name in property_names
            if property_names.size() == 0 and include_properties:
                should_include_property = (usage & PROPERTY_USAGE_STORAGE) != 0
            if should_include_property:
                properties[property_name] = variant_to_json(node.get(property_name))
        node_data["properties"] = properties

    if include_signals:
        var connections = []
        for signal_info in node.get_signal_list():
            var signal_name = str(signal_info.name)
            for connection in node.get_signal_connection_list(signal_name):
                connections.append(connection_to_json(scene_root, node, signal_name, connection))
        if not connections.is_empty():
            node_data["connections"] = connections

    return node_data

func inspect_scene(params):
    if not params.has("scene_path"):
        printerr("Scene path is required")
        quit(1)

    var full_scene_path = to_res_path(params.scene_path)
    if not FileAccess.file_exists(full_scene_path):
        printerr("Scene file does not exist at: " + full_scene_path)
        quit(1)

    var scene = load(full_scene_path)
    if not scene or not (scene is PackedScene):
        printerr("Failed to load scene as PackedScene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    if not scene_root:
        printerr("Failed to instantiate scene: " + full_scene_path)
        quit(1)

    var include_properties = bool(params.get("include_properties", false))
    var include_signals = bool(params.get("include_signals", false))
    var property_names = []
    if params.has("property_names") and typeof(params.property_names) == TYPE_ARRAY:
        for property_name in params.property_names:
            property_names.append(str(property_name))

    var selected_root = get_scene_node(scene_root, params.get("node_path", "root"))
    if not selected_root:
        printerr("Node not found: " + str(params.node_path))
        scene_root.free()
        quit(1)
        return
    var nodes = []
    append_scene_nodes(selected_root, nodes)
    var offset = int(params.get("offset", 0))
    var limit = int(params.get("limit", 50))
    var page = []
    for node in nodes.slice(offset, offset + limit):
        page.append(node_to_inspection(scene_root, node, include_properties, property_names, include_signals))
    var result = {
            "scenePath": full_scene_path,
            "nodeCount": nodes.size(),
            "nodes": page
    }
    if offset + limit < nodes.size():
        result["nextOffset"] = offset + limit
    print_json(result)
    scene_root.free()

func validate_scene_internal(scene_path):
    var full_scene_path = to_res_path(scene_path)
    var result = {
            "scenePath": full_scene_path,
            "valid": true,
            "errors": [],
            "warnings": [],
            "nodeCount": 0
    }

    if not FileAccess.file_exists(full_scene_path):
        result.valid = false
        result.errors.append("Scene file does not exist: " + full_scene_path)
        return result

    if not ResourceLoader.exists(full_scene_path):
        result.warnings.append("ResourceLoader does not report this scene as an importable resource")

    var scene = load(full_scene_path)
    if not scene:
        result.valid = false
        result.errors.append("Scene failed to load")
        return result

    if not (scene is PackedScene):
        result.valid = false
        result.errors.append("Resource is not a PackedScene")
        return result

    var scene_root = scene.instantiate()
    if not scene_root:
        result.valid = false
        result.errors.append("Scene failed to instantiate")
        return result

    var nodes = []
    append_scene_nodes(scene_root, nodes)
    result.nodeCount = nodes.size()

    for node in nodes:
        var script = node.get_script()
        if script:
            var script_path = script.resource_path
            if script_path != "" and not FileAccess.file_exists(script_path):
                result.valid = false
                result.errors.append("Missing script on " + get_mcp_node_path(scene_root, node) + ": " + script_path)

    var packed_scene = PackedScene.new()
    var pack_result = packed_scene.pack(scene_root)
    if pack_result != OK:
        result.valid = false
        result.errors.append("Scene failed to repack: " + error_name(pack_result))

    scene_root.free()
    return result

func validate_scene(params):
    if not params.has("scene_path"):
        printerr("Scene path is required")
        quit(1)

    print_json(validate_scene_internal(params.scene_path))

func validate_script_internal(script_path):
    var full_script_path = to_res_path(script_path)
    var result = {
            "errors": [],
            "warnings": []
    }

    if not FileAccess.file_exists(full_script_path):
        result.errors.append("Script file does not exist")
        return result

    var source = FileAccess.get_file_as_string(full_script_path)
    var open_error = FileAccess.get_open_error()
    if open_error != OK:
        result.errors.append("Script failed to read: " + error_string(open_error) + " (" + str(open_error) + ")")
        return result

    var script = GDScript.new()
    script.resource_path = full_script_path
    script.source_code = source
    var reload_error = script.reload(false)
    if reload_error == ERR_PARSE_ERROR:
        result.errors.append("Script failed to parse: " + error_string(reload_error) + " (" + str(reload_error) + ")")
    elif reload_error != OK and reload_error != ERR_COMPILATION_FAILED:
        result.errors.append("Script failed to validate: " + error_string(reload_error) + " (" + str(reload_error) + ")")

    return result

func validate_project(params):
    var result = {
            "valid": true,
            "sceneCount": 0,
            "scriptCount": 0,
            "errors": [],
            "warnings": []
    }

    var scenes = find_files("res://", ".tscn")
    result.sceneCount = scenes.size()
    for scene_path in scenes:
        var scene_result = validate_scene_internal(scene_path)
        if not scene_result.valid:
            result.valid = false
            for scene_error in scene_result.errors:
                result.errors.append(scene_path + ": " + str(scene_error))
        for scene_warning in scene_result.warnings:
            result.warnings.append(scene_path + ": " + str(scene_warning))

    var scripts = find_files("res://", ".gd")
    result.scriptCount = scripts.size()
    for script_path in scripts:
        var script_result = validate_script_internal(script_path)
        if script_result.errors.size() > 0:
            result.valid = false
            for script_error in script_result.errors:
                result.errors.append(script_path + ": " + str(script_error))
        for script_warning in script_result.warnings:
            result.warnings.append(script_path + ": " + str(script_warning))

    print_json(result)

func find_files(path, extension):
    var files = []
    var dir = DirAccess.open(path)

    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()

        while file_name != "":
            if dir.current_is_dir() and not file_name.begins_with("."):
                files.append_array(find_files(path + file_name + "/", extension))
            elif file_name.ends_with(extension):
                files.append(path + file_name)

            file_name = dir.get_next()

    return files

func inspect_resource(params):
    var resource_path = to_res_path(params.resource_path)
    var resource = load(resource_path)
    if not resource:
        printerr("Failed to load resource: " + resource_path)
        quit(1)
        return
    var selected = []
    var names = params.get("property_names", [])
    for property in resource.get_property_list():
        if (not names.is_empty() and str(property.name) in names) or (names.is_empty() and (int(property.get("usage", 0)) & PROPERTY_USAGE_STORAGE) != 0):
            selected.append(str(property.name))
    var offset = int(params.get("offset", 0))
    var limit = int(params.get("limit", 50))
    var page = selected.slice(offset, offset + limit)
    var result = {"resourcePath": resource_path, "type": resource.get_class(), "propertyCount": selected.size()}
    if bool(params.get("include_properties", false)) or not names.is_empty():
        var properties = {}
        for name in page:
            properties[name] = variant_to_json(resource.get(name))
        result["properties"] = properties
    else:
        result["propertyNames"] = page
    if offset + limit < selected.size():
        result["nextOffset"] = offset + limit
    print_json(result)
