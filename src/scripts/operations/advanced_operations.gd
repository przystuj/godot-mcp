extends RefCounted

func execute(operation, params):
    match operation:
        "run_scene_for_seconds":
            run_scene_for_seconds(params)
        "get_runtime_scene_tree":
            get_runtime_scene_tree(params)
        "call_node_method":
            call_node_method(params)
        "send_input_action":
            send_input_action(params)
        "wait_for_signal":
            wait_for_signal(params)
        "assert_node_property":
            assert_node_property(params)
        "create_script":
            create_script(params)
        "attach_script":
            attach_script(params)
        "inspect_script":
            inspect_script(params)
        "list_script_methods":
            list_script_methods(params)
        "list_script_exports":
            list_script_exports(params)
        "set_exported_variable":
            set_exported_variable(params)
        "remove_node":
            remove_node(params)
        "rename_node":
            rename_node(params)
        "duplicate_node":
            duplicate_node(params)
        "move_node":
            move_node(params)
        "reparent_node":
            reparent_node(params)
        "find_nodes_by_type":
            find_nodes_by_type(params)
        "find_nodes_by_script":
            find_nodes_by_script(params)
        "inspect_resource":
            inspect_resource(params)
        "create_resource":
            create_resource(params)
        "set_resource_property":
            set_resource_property(params)
        "create_material":
            create_material(params)
        "create_theme":
            create_theme(params)
        "create_animation_library":
            create_animation_library(params)
        "set_main_scene":
            set_main_scene(params)
        "set_display_size":
            set_display_size(params)
        "set_rendering_setting":
            set_rendering_setting(params)
        "configure_physics_layers":
            configure_layer_names("2d_physics", params)
        "configure_2d_layers":
            configure_layer_names("2d_render", params)
        "configure_3d_layers":
            configure_layer_names("3d_render", params)
        "set_export_preset":
            set_export_preset(params)
        "reimport_asset":
            reimport_asset(params)
        "list_imported_assets":
            list_imported_assets(params)
        "get_import_metadata":
            get_import_metadata(params)
        "set_texture_import_mode":
            set_import_options(params)
        "set_model_import_options":
            set_import_options(params)
        "get_project_errors":
            get_project_errors(params)
        "get_missing_resources":
            get_missing_resources(params)
        "find_broken_scene_references":
            find_broken_scene_references(params)
        "find_unused_assets":
            find_unused_assets(params)
        "find_orphan_scripts":
            find_orphan_scripts(params)
        "check_scene_cycles":
            check_scene_cycles(params)
        _:
            return false
    return true

func to_res_path(path):
    var res_path = str(path)
    if not res_path.begins_with("res://"):
        res_path = "res://" + res_path
    return res_path

func print_json(value):
    print(JSON.stringify(value))

func fail(message):
    printerr("[ERROR] " + str(message))
    var main_loop = Engine.get_main_loop()
    if main_loop:
        main_loop.quit(1)

func error_name(error_code):
    if error_code == OK:
        return "OK"
    return str(error_code)

func ensure_parent_dir(resource_path):
    var dir_path = to_res_path(resource_path).get_base_dir()
    if dir_path == "res://":
        return
    var dir = DirAccess.open("res://")
    if not dir:
        fail("Failed to open project root")
    var relative_dir = dir_path.substr(6)
    var error = dir.make_dir_recursive(relative_dir)
    if error != OK and error != ERR_ALREADY_EXISTS:
        fail("Failed to create directory " + dir_path + ": " + error_name(error))

func find_files(path, extension):
    var files = []
    var dir = DirAccess.open(path)
    if not dir:
        return files
    dir.list_dir_begin()
    var file_name = dir.get_next()
    while file_name != "":
        if dir.current_is_dir() and not file_name.begins_with("."):
            files.append_array(find_files(path.path_join(file_name), extension))
        elif file_name.ends_with(extension):
            files.append(path.path_join(file_name))
        file_name = dir.get_next()
    return files

func read_text(path):
    var file = FileAccess.open(to_res_path(path), FileAccess.READ)
    if not file:
        return ""
    var text = file.get_as_text()
    file.close()
    return text

func write_text(path, content):
    var res_path = to_res_path(path)
    ensure_parent_dir(res_path)
    var file = FileAccess.open(res_path, FileAccess.WRITE)
    if not file:
        fail("Failed to open file for writing: " + res_path)
    file.store_string(str(content))
    file.close()

func get_scene_node(scene_root, node_path):
    var normalized_path = str(node_path)
    if normalized_path == "" or normalized_path == "." or normalized_path == "root":
        return scene_root
    if normalized_path.begins_with("root/"):
        normalized_path = normalized_path.substr(5)
    return scene_root.get_node_or_null(normalized_path)

func get_mcp_node_path(scene_root, node):
    if node == scene_root:
        return "root"
    return "root/" + str(scene_root.get_path_to(node))

func append_scene_nodes(node, nodes):
    nodes.append(node)
    for child in node.get_children():
        append_scene_nodes(child, nodes)

func load_scene_root(scene_path):
    var full_scene_path = to_res_path(scene_path)
    if not FileAccess.file_exists(full_scene_path):
        fail("Scene file does not exist: " + full_scene_path)
    var scene = load(full_scene_path)
    if not scene or not (scene is PackedScene):
        fail("Failed to load scene as PackedScene: " + full_scene_path)
    var scene_root = scene.instantiate()
    if not scene_root:
        fail("Failed to instantiate scene: " + full_scene_path)
    return scene_root

func save_scene_root(scene_root, scene_path):
    var full_scene_path = to_res_path(scene_path)
    var packed_scene = PackedScene.new()
    var pack_result = packed_scene.pack(scene_root)
    if pack_result != OK:
        fail("Failed to pack scene: " + error_name(pack_result))
    var save_error = ResourceSaver.save(packed_scene, full_scene_path)
    if save_error != OK:
        fail("Failed to save scene: " + error_name(save_error))

func set_owner_recursive(node, owner):
    node.owner = owner
    for child in node.get_children():
        set_owner_recursive(child, owner)

func object_has_property(object, property_name):
    for property in object.get_property_list():
        if str(property.name) == str(property_name):
            return true
    return false

func variant_to_json(value, depth := 0):
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
            return {"type": "NodePath", "path": str(value)}
        TYPE_VECTOR2:
            return {"type": "Vector2", "x": value.x, "y": value.y}
        TYPE_VECTOR2I:
            return {"type": "Vector2i", "x": value.x, "y": value.y}
        TYPE_VECTOR3:
            return {"type": "Vector3", "x": value.x, "y": value.y, "z": value.z}
        TYPE_VECTOR3I:
            return {"type": "Vector3i", "x": value.x, "y": value.y, "z": value.z}
        TYPE_COLOR:
            return {"type": "Color", "r": value.r, "g": value.g, "b": value.b, "a": value.a}
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
                return {"type": value.get_class(), "resourcePath": value.resource_path}
            if value is Node:
                return {"type": value.get_class(), "name": value.name, "path": str(value.get_path())}
            return {"type": value.get_class(), "value": str(value)}
        _:
            return str(value)

func json_to_variant(value):
    if typeof(value) == TYPE_ARRAY:
        var converted_array = []
        for item in value:
            converted_array.append(json_to_variant(item))
        return converted_array
    if typeof(value) != TYPE_DICTIONARY or not value.has("type"):
        if typeof(value) == TYPE_STRING and str(value).begins_with("res://"):
            var loaded_resource = load(value)
            if loaded_resource:
                return loaded_resource
        return value
    var type_name = str(value.type).to_lower()
    match type_name:
        "vector2":
            return Vector2(float(value.get("x", 0.0)), float(value.get("y", 0.0)))
        "vector2i":
            return Vector2i(int(value.get("x", 0)), int(value.get("y", 0)))
        "vector3":
            return Vector3(float(value.get("x", 0.0)), float(value.get("y", 0.0)), float(value.get("z", 0.0)))
        "vector3i":
            return Vector3i(int(value.get("x", 0)), int(value.get("y", 0)), int(value.get("z", 0)))
        "color":
            return Color(float(value.get("r", 0.0)), float(value.get("g", 0.0)), float(value.get("b", 0.0)), float(value.get("a", 1.0)))
        "nodepath":
            return NodePath(str(value.get("path", "")))
        "stringname":
            return StringName(str(value.get("name", value.get("value", ""))))
        "resource":
            var resource_path = str(value.get("path", value.get("resourcePath", "")))
            if resource_path == "":
                return null
            return load(to_res_path(resource_path))
        _:
            return value

func node_to_json(scene_root, node):
    var children = []
    for child in node.get_children():
        children.append(node_to_json(scene_root, child))
    return {
        "name": str(node.name),
        "path": get_mcp_node_path(scene_root, node),
        "type": node.get_class(),
        "children": children
    }

func run_scene_for_seconds(params):
    var seconds = float(params.get("seconds", 1.0))
    var scene_root = load_scene_root(params.scene_path)
    var nodes = []
    append_scene_nodes(scene_root, nodes)
    print_json({
        "scenePath": to_res_path(params.scene_path),
        "secondsRequested": seconds,
        "nodeCount": nodes.size(),
        "tree": node_to_json(scene_root, scene_root),
        "note": "Scene was loaded and instantiated in a headless one-shot operation."
    })

func get_runtime_scene_tree(params):
    var scene_root = load_scene_root(params.scene_path)
    var nodes = []
    append_scene_nodes(scene_root, nodes)
    print_json({
        "scenePath": to_res_path(params.scene_path),
        "nodeCount": nodes.size(),
        "tree": node_to_json(scene_root, scene_root)
    })

func call_node_method(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node:
        fail("Node not found: " + str(params.node_path))
    var method_name = str(params.method_name)
    if not node.has_method(method_name):
        fail("Node does not expose method: " + method_name)
    var method_args = params.get("args", [])
    var converted_args = []
    for item in method_args:
        converted_args.append(json_to_variant(item))
    var result = node.callv(method_name, converted_args)
    if bool(params.get("save_scene", false)):
        save_scene_root(scene_root, params.scene_path)
    print_json({
        "scenePath": to_res_path(params.scene_path),
        "nodePath": str(params.node_path),
        "methodName": method_name,
        "result": variant_to_json(result)
    })

func send_input_action(params):
    var action_name = str(params.action_name)
    var pressed = bool(params.get("pressed", true))
    var strength = float(params.get("strength", 1.0))
    if pressed:
        Input.action_press(action_name, strength)
    else:
        Input.action_release(action_name)
    print_json({
        "actionName": action_name,
        "pressed": Input.is_action_pressed(action_name),
        "strength": Input.get_action_strength(action_name)
    })

func wait_for_signal(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node:
        fail("Node not found: " + str(params.node_path))
    var signal_name = str(params.signal_name)
    if not node.has_signal(signal_name):
        fail("Node does not expose signal: " + signal_name)
    print_json({
        "scenePath": to_res_path(params.scene_path),
        "nodePath": str(params.node_path),
        "signalName": signal_name,
        "emitted": false,
        "note": "One-shot MCP operation verified the signal exists. Persistent wait requires a long-running runtime session."
    })

func assert_node_property(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node:
        fail("Node not found: " + str(params.node_path))
    var property_name = str(params.property_name)
    if not object_has_property(node, property_name):
        fail("Node does not expose property: " + property_name)
    var actual = variant_to_json(node.get(property_name))
    var expected = variant_to_json(json_to_variant(params.expected_value))
    var passed = JSON.stringify(actual) == JSON.stringify(expected)
    print_json({
        "passed": passed,
        "scenePath": to_res_path(params.scene_path),
        "nodePath": str(params.node_path),
        "propertyName": property_name,
        "actual": actual,
        "expected": expected
    })

func create_script(params):
    var script_path = to_res_path(params.script_path)
    var content = str(params.get("content", ""))
    if content == "":
        var extends_class = str(params.get("extends_class", "Node"))
        content = "extends " + extends_class + "\n"
        if params.has("class_name"):
            content += "class_name " + str(params.class_name) + "\n"
        content += "\n"
    write_text(script_path, content)
    print_json({"scriptPath": script_path, "bytes": content.length()})

func attach_script(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node:
        fail("Node not found: " + str(params.node_path))
    var script_path = to_res_path(params.script_path)
    var script = load(script_path)
    if not script:
        fail("Failed to load script: " + script_path)
    node.set_script(script)
    save_scene_root(scene_root, params.scene_path)
    print_json({"scenePath": to_res_path(params.scene_path), "nodePath": str(params.node_path), "scriptPath": script_path})

func script_to_json(script_path):
    var full_script_path = to_res_path(script_path)
    if not FileAccess.file_exists(full_script_path):
        fail("Script file does not exist: " + full_script_path)
    var script = load(full_script_path)
    if not script:
        fail("Failed to load script: " + full_script_path)
    return {
        "scriptPath": full_script_path,
        "methods": variant_to_json(script.get_script_method_list()),
        "properties": variant_to_json(script.get_script_property_list()),
        "signals": variant_to_json(script.get_script_signal_list())
    }

func inspect_script(params):
    print_json(script_to_json(params.script_path))

func list_script_methods(params):
    var data = script_to_json(params.script_path)
    print_json({"scriptPath": data.scriptPath, "methods": data.methods})

func list_script_exports(params):
    var data = script_to_json(params.script_path)
    var exports = []
    for property in data.properties:
        var usage = int(property.get("usage", 0))
        if (usage & PROPERTY_USAGE_SCRIPT_VARIABLE) != 0:
            exports.append(property)
    print_json({"scriptPath": data.scriptPath, "exports": exports})

func set_exported_variable(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node:
        fail("Node not found: " + str(params.node_path))
    var property_name = str(params.property_name)
    if not object_has_property(node, property_name):
        fail("Node does not expose property: " + property_name)
    node.set(property_name, json_to_variant(params.value))
    save_scene_root(scene_root, params.scene_path)
    print_json({"scenePath": to_res_path(params.scene_path), "nodePath": str(params.node_path), "propertyName": property_name, "value": variant_to_json(node.get(property_name))})

func remove_node(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node or node == scene_root:
        fail("Node not found or cannot remove root: " + str(params.node_path))
    var parent = node.get_parent()
    parent.remove_child(node)
    save_scene_root(scene_root, params.scene_path)
    print_json({"removedNodePath": str(params.node_path), "scenePath": to_res_path(params.scene_path)})

func rename_node(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node:
        fail("Node not found: " + str(params.node_path))
    node.name = str(params.new_name)
    save_scene_root(scene_root, params.scene_path)
    print_json({"scenePath": to_res_path(params.scene_path), "oldNodePath": str(params.node_path), "newName": str(params.new_name)})

func duplicate_node(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node or node == scene_root:
        fail("Node not found or cannot duplicate root: " + str(params.node_path))
    var duplicate = node.duplicate()
    if params.has("new_name"):
        duplicate.name = str(params.new_name)
    node.get_parent().add_child(duplicate)
    set_owner_recursive(duplicate, scene_root)
    save_scene_root(scene_root, params.scene_path)
    print_json({"scenePath": to_res_path(params.scene_path), "sourceNodePath": str(params.node_path), "duplicatePath": get_mcp_node_path(scene_root, duplicate)})

func move_node(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    if not node or node == scene_root:
        fail("Node not found or cannot move root: " + str(params.node_path))
    var parent = node.get_parent()
    parent.move_child(node, int(params.target_index))
    save_scene_root(scene_root, params.scene_path)
    print_json({"scenePath": to_res_path(params.scene_path), "nodePath": str(params.node_path), "targetIndex": int(params.target_index)})

func reparent_node(params):
    var scene_root = load_scene_root(params.scene_path)
    var node = get_scene_node(scene_root, params.node_path)
    var new_parent = get_scene_node(scene_root, params.new_parent_node_path)
    if not node or node == scene_root:
        fail("Node not found or cannot reparent root: " + str(params.node_path))
    if not new_parent:
        fail("New parent node not found: " + str(params.new_parent_node_path))
    node.get_parent().remove_child(node)
    new_parent.add_child(node)
    set_owner_recursive(node, scene_root)
    save_scene_root(scene_root, params.scene_path)
    print_json({"scenePath": to_res_path(params.scene_path), "nodePath": get_mcp_node_path(scene_root, node), "newParentNodePath": str(params.new_parent_node_path)})

func find_nodes_by_type(params):
    var scene_root = load_scene_root(params.scene_path)
    var nodes = []
    append_scene_nodes(scene_root, nodes)
    var matches = []
    var type_name = str(params.node_type)
    for node in nodes:
        if node.get_class() == type_name or node.is_class(type_name):
            matches.append({"path": get_mcp_node_path(scene_root, node), "name": str(node.name), "type": node.get_class()})
    print_json({"scenePath": to_res_path(params.scene_path), "nodeType": type_name, "matches": matches})

func find_nodes_by_script(params):
    var scene_root = load_scene_root(params.scene_path)
    var script_path = to_res_path(params.script_path)
    var nodes = []
    append_scene_nodes(scene_root, nodes)
    var matches = []
    for node in nodes:
        var script = node.get_script()
        if script and script.resource_path == script_path:
            matches.append({"path": get_mcp_node_path(scene_root, node), "name": str(node.name), "type": node.get_class()})
    print_json({"scenePath": to_res_path(params.scene_path), "scriptPath": script_path, "matches": matches})

func inspect_resource(params):
    var resource_path = to_res_path(params.resource_path)
    var resource = load(resource_path)
    if not resource:
        fail("Failed to load resource: " + resource_path)
    var properties = {}
    for property in resource.get_property_list():
        var name = str(property.name)
        if (int(property.get("usage", 0)) & PROPERTY_USAGE_STORAGE) != 0:
            properties[name] = variant_to_json(resource.get(name))
    print_json({"resourcePath": resource_path, "type": resource.get_class(), "properties": properties})

func instantiate_resource(resource_type):
    if not ClassDB.class_exists(resource_type) or not ClassDB.can_instantiate(resource_type):
        fail("Resource type cannot be instantiated: " + resource_type)
    var resource = ClassDB.instantiate(resource_type)
    if not resource or not (resource is Resource):
        fail("Class is not a Resource: " + resource_type)
    return resource

func create_resource(params):
    var output_path = to_res_path(params.output_path)
    var resource = instantiate_resource(str(params.resource_type))
    if params.has("properties"):
        for key in params.properties.keys():
            resource.set(str(key), json_to_variant(params.properties[key]))
    ensure_parent_dir(output_path)
    var save_error = ResourceSaver.save(resource, output_path)
    if save_error != OK:
        fail("Failed to save resource: " + error_name(save_error))
    print_json({"resourcePath": output_path, "type": resource.get_class()})

func set_resource_property(params):
    var resource_path = to_res_path(params.resource_path)
    var resource = load(resource_path)
    if not resource:
        fail("Failed to load resource: " + resource_path)
    resource.set(str(params.property_name), json_to_variant(params.value))
    var save_error = ResourceSaver.save(resource, resource_path)
    if save_error != OK:
        fail("Failed to save resource: " + error_name(save_error))
    print_json({"resourcePath": resource_path, "propertyName": str(params.property_name), "value": variant_to_json(resource.get(str(params.property_name)))})

func create_material(params):
    var output_path = to_res_path(params.output_path)
    var material_type = str(params.get("material_type", "StandardMaterial3D"))
    var material = instantiate_resource(material_type)
    if params.has("properties"):
        for key in params.properties.keys():
            material.set(str(key), json_to_variant(params.properties[key]))
    ensure_parent_dir(output_path)
    var save_error = ResourceSaver.save(material, output_path)
    if save_error != OK:
        fail("Failed to save material: " + error_name(save_error))
    print_json({"resourcePath": output_path, "type": material.get_class()})

func create_theme(params):
    var output_path = to_res_path(params.output_path)
    var theme = Theme.new()
    ensure_parent_dir(output_path)
    var save_error = ResourceSaver.save(theme, output_path)
    if save_error != OK:
        fail("Failed to save theme: " + error_name(save_error))
    print_json({"resourcePath": output_path, "type": theme.get_class()})

func create_animation_library(params):
    var output_path = to_res_path(params.output_path)
    var library = AnimationLibrary.new()
    if params.has("animations") and typeof(params.animations) == TYPE_ARRAY:
        for animation_name in params.animations:
            library.add_animation(str(animation_name), Animation.new())
    ensure_parent_dir(output_path)
    var save_error = ResourceSaver.save(library, output_path)
    if save_error != OK:
        fail("Failed to save animation library: " + error_name(save_error))
    print_json({"resourcePath": output_path, "type": library.get_class(), "animations": library.get_animation_list()})

func save_project_settings():
    var save_error = ProjectSettings.save()
    if save_error != OK:
        fail("Failed to save project settings: " + error_name(save_error))

func set_main_scene(params):
    var scene_path = to_res_path(params.scene_path)
    if not FileAccess.file_exists(scene_path):
        fail("Scene file does not exist: " + scene_path)
    ProjectSettings.set_setting("application/run/main_scene", scene_path)
    save_project_settings()
    print_json({"mainScene": scene_path})

func set_display_size(params):
    var width = int(params.width)
    var height = int(params.height)
    ProjectSettings.set_setting("display/window/size/viewport_width", width)
    ProjectSettings.set_setting("display/window/size/viewport_height", height)
    if params.has("mode"):
        ProjectSettings.set_setting("display/window/size/mode", int(params.mode))
    save_project_settings()
    print_json({"width": width, "height": height})

func set_rendering_setting(params):
    var setting_name = str(params.setting_name)
    if not setting_name.begins_with("rendering/"):
        fail("Rendering setting must start with rendering/")
    ProjectSettings.set_setting(setting_name, json_to_variant(params.value))
    save_project_settings()
    print_json({"settingName": setting_name, "value": variant_to_json(ProjectSettings.get_setting(setting_name))})

func configure_layer_names(category, params):
    var layers = params.layers
    if typeof(layers) != TYPE_ARRAY:
        fail("layers must be an array")
    var configured = []
    for layer in layers:
        var index = int(layer.get("index", 0))
        if index < 1 or index > 32:
            fail("Layer index must be between 1 and 32")
        var name = str(layer.get("name", ""))
        var setting_name = "layer_names/" + category + "/layer_" + str(index)
        ProjectSettings.set_setting(setting_name, name)
        configured.append({"index": index, "name": name, "settingName": setting_name})
    save_project_settings()
    print_json({"category": category, "layers": configured})

func set_export_preset(params):
    var config = ConfigFile.new()
    var path = "res://export_presets.cfg"
    if FileAccess.file_exists(path):
        config.load(path)
    var preset_index = int(params.get("preset_index", 0))
    var section = "preset." + str(preset_index)
    config.set_value(section, "name", str(params.name))
    config.set_value(section, "platform", str(params.platform))
    config.set_value(section, "runnable", bool(params.get("runnable", true)))
    if params.has("export_path"):
        config.set_value(section + ".options", "custom_template/release", "")
        config.set_value(section, "export_path", str(params.export_path))
    if params.has("options") and typeof(params.options) == TYPE_DICTIONARY:
        for key in params.options.keys():
            config.set_value(section + ".options", str(key), json_to_variant(params.options[key]))
    var save_error = config.save(path)
    if save_error != OK:
        fail("Failed to save export preset: " + error_name(save_error))
    print_json({"presetIndex": preset_index, "name": str(params.name), "platform": str(params.platform), "path": path})

func imported_metadata_path(asset_path):
    return to_res_path(asset_path) + ".import"

func parse_import_metadata(asset_path):
    var metadata_path = imported_metadata_path(asset_path)
    var config = ConfigFile.new()
    var error = config.load(metadata_path)
    if error != OK:
        return {"assetPath": to_res_path(asset_path), "metadataPath": metadata_path, "exists": false}
    var data = {"assetPath": to_res_path(asset_path), "metadataPath": metadata_path, "exists": true, "sections": {}}
    for section in config.get_sections():
        var values = {}
        for key in config.get_section_keys(section):
            values[key] = variant_to_json(config.get_value(section, key))
        data["sections"][section] = values
    return data

func reimport_asset(params):
    var asset_path = to_res_path(params.asset_path)
    if not FileAccess.file_exists(asset_path):
        fail("Asset does not exist: " + asset_path)
    var metadata = parse_import_metadata(asset_path)
    print_json({
        "assetPath": asset_path,
        "metadata": metadata,
        "note": "Headless one-shot MCP cannot force EditorFileSystem reimport; metadata is available for the editor to reimport."
    })

func list_imported_assets(params):
    var imports = find_files("res://", ".import")
    var assets = []
    for import_path in imports:
        var asset_path = import_path.substr(0, import_path.length() - ".import".length())
        assets.append(parse_import_metadata(asset_path))
    print_json({"count": assets.size(), "assets": assets})

func get_import_metadata(params):
    print_json(parse_import_metadata(params.asset_path))

func set_import_options(params):
    var metadata_path = imported_metadata_path(params.asset_path)
    var config = ConfigFile.new()
    var load_error = config.load(metadata_path)
    if load_error != OK:
        fail("Import metadata does not exist: " + metadata_path)
    if params.has("options") and typeof(params.options) == TYPE_DICTIONARY:
        for key in params.options.keys():
            config.set_value("params", str(key), json_to_variant(params.options[key]))
    var save_error = config.save(metadata_path)
    if save_error != OK:
        fail("Failed to save import metadata: " + error_name(save_error))
    print_json(parse_import_metadata(params.asset_path))

func collect_res_references(text):
    var references = []
    var regex = RegEx.new()
    regex.compile("res://[^\\\"'\\)\\]\\s]+")
    for match_result in regex.search_all(text):
        var reference = match_result.get_string()
        if not reference in references:
            references.append(reference)
    return references

func all_reference_files():
    return find_files("res://", ".tscn") + find_files("res://", ".tres") + find_files("res://", ".gd") + find_files("res://", ".cfg")

func get_missing_resources(params):
    var missing = []
    for file_path in all_reference_files():
        for reference in collect_res_references(read_text(file_path)):
            if not FileAccess.file_exists(reference) and not ResourceLoader.exists(reference):
                missing.append({"source": file_path, "reference": reference})
    print_json({"missing": missing, "count": missing.size()})

func find_broken_scene_references(params):
    var broken = []
    for file_path in find_files("res://", ".tscn") + find_files("res://", ".tres"):
        for reference in collect_res_references(read_text(file_path)):
            if not FileAccess.file_exists(reference) and not ResourceLoader.exists(reference):
                broken.append({"source": file_path, "reference": reference})
    print_json({"brokenReferences": broken, "count": broken.size()})

func get_project_errors(params):
    var load_errors = []
    for scene_path in find_files("res://", ".tscn"):
        var scene = load(scene_path)
        if not scene:
            load_errors.append({"path": scene_path, "error": "Failed to load scene"})
    for script_path in find_files("res://", ".gd"):
        var script = load(script_path)
        if not script:
            load_errors.append({"path": script_path, "error": "Failed to load script"})
    var missing = []
    for file_path in all_reference_files():
        for reference in collect_res_references(read_text(file_path)):
            if not FileAccess.file_exists(reference) and not ResourceLoader.exists(reference):
                missing.append({"source": file_path, "reference": reference})
    print_json({"valid": load_errors.is_empty() and missing.is_empty(), "loadErrors": load_errors, "missingResources": missing})

func asset_extensions():
    return [".png", ".jpg", ".jpeg", ".webp", ".svg", ".ogg", ".wav", ".mp3", ".glb", ".gltf", ".fbx", ".obj", ".tres", ".res", ".material"]

func find_unused_assets(params):
    var referenced = {}
    for file_path in all_reference_files():
        for reference in collect_res_references(read_text(file_path)):
            referenced[reference] = true
    var assets = []
    for extension in asset_extensions():
        assets.append_array(find_files("res://", extension))
    var unused = []
    for asset_path in assets:
        if not referenced.has(asset_path):
            unused.append(asset_path)
    print_json({"unusedAssets": unused, "count": unused.size()})

func find_orphan_scripts(params):
    var referenced = {}
    for file_path in find_files("res://", ".tscn") + find_files("res://", ".tres") + ["res://project.godot"]:
        for reference in collect_res_references(read_text(file_path)):
            referenced[reference] = true
    var orphaned = []
    for script_path in find_files("res://", ".gd"):
        if not referenced.has(script_path):
            orphaned.append(script_path)
    print_json({"orphanScripts": orphaned, "count": orphaned.size()})

func scene_dependencies(scene_path):
    var dependencies = []
    for reference in collect_res_references(read_text(scene_path)):
        if reference.ends_with(".tscn"):
            dependencies.append(reference)
    return dependencies

func check_scene_cycles(params):
    var scenes = find_files("res://", ".tscn")
    var cycles = []
    for start_scene in scenes:
        var stack = [{"path": start_scene, "trail": []}]
        while not stack.is_empty():
            var item = stack.pop_back()
            var current_path = item["path"]
            var trail = item["trail"].duplicate()
            if current_path in trail:
                var cycle = trail.slice(trail.find(current_path)) + [current_path]
                cycles.append(cycle)
                continue
            trail.append(current_path)
            for dependency in scene_dependencies(current_path):
                stack.append({"path": dependency, "trail": trail})
    print_json({"cycles": cycles, "count": cycles.size()})
