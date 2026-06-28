interface AdvancedToolSpec {
  name: string;
  operation: string;
  required: string[];
  pathFields?: string[];
  existingPathFields?: string[];
  nodePathFields?: string[];
  identifierFields?: string[];
  looseNameFields?: string[];
  propertyFields?: string[];
}

const projectPath = {
  type: 'string',
  description: 'Path to the Godot project directory',
};

const scenePath = {
  type: 'string',
  description: 'Path to the scene file, relative to the project or res://',
};

const nodePath = {
  type: 'string',
  description: 'Path to a scene node, such as root or root/Player',
};

const scriptPath = {
  type: 'string',
  description: 'Path to a GDScript file, relative to the project or res://',
};

const resourcePath = {
  type: 'string',
  description: 'Path to a Godot resource, relative to the project or res://',
};

const outputPath = {
  type: 'string',
  description: 'Output path, relative to the project or res://',
};

const jsonValue = {
  description: 'JSON-compatible value. Godot variants can use typed objects like { "type": "Vector2", "x": 1, "y": 2 } or { "type": "Resource", "path": "res://asset.tres" }',
};

function tool(name: string, description: string, properties: Record<string, any>, required: string[]): any {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        projectPath,
        ...properties,
      },
      required: ['projectPath', ...required],
    },
  };
}

export const ADVANCED_TOOLS: any[] = [
  tool('run_scene_for_seconds', 'Load and instantiate a scene headlessly and return runtime-style scene tree information', {
    scenePath,
    seconds: { type: 'number', description: 'Requested runtime duration in seconds' },
  }, ['scenePath']),
  tool('get_runtime_scene_tree', 'Load and instantiate a scene headlessly and return the runtime node tree', {
    scenePath,
  }, ['scenePath']),
  tool('call_node_method', 'Load a scene, call a method on a node, and optionally save the scene afterward', {
    scenePath,
    nodePath,
    methodName: { type: 'string', description: 'Method name to call' },
    args: { type: 'array', description: 'Arguments to pass to the method' },
    saveScene: { type: 'boolean', description: 'Whether to save the scene after calling the method' },
  }, ['scenePath', 'nodePath', 'methodName']),
  tool('send_input_action', 'Press or release an InputMap action inside a one-shot headless operation', {
    actionName: { type: 'string', description: 'Input action name' },
    pressed: { type: 'boolean', description: 'Whether to press or release the action' },
    strength: { type: 'number', description: 'Action strength when pressing' },
  }, ['actionName']),
  tool('wait_for_signal', 'Verify a node signal exists in a scene and report one-shot wait capability', {
    scenePath,
    nodePath,
    signalName: { type: 'string', description: 'Signal name' },
    timeoutSeconds: { type: 'number', description: 'Requested timeout in seconds' },
  }, ['scenePath', 'nodePath', 'signalName']),
  tool('assert_node_property', 'Compare a node property to an expected value in a loaded scene', {
    scenePath,
    nodePath,
    propertyName: { type: 'string', description: 'Property name to compare' },
    expectedValue: jsonValue,
  }, ['scenePath', 'nodePath', 'propertyName', 'expectedValue']),

  tool('set_node_properties', 'Set properties on multiple nodes in one Godot load/save pass', {
    scenePath,
    changes: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of { nodePath, properties } changes',
    },
  }, ['scenePath', 'changes']),
  tool('apply_scene_operations', 'Apply multiple semantic scene operations in one Godot load/save pass', {
    scenePath,
    operations: {
      type: 'array',
      items: { type: 'object' },
      description: 'Operations: add_node, set_properties, attach_script, connect_signal, remove_node, rename_node, duplicate_node, move_node, reparent_node',
    },
  }, ['scenePath', 'operations']),
  tool('create_scene_from_spec', 'Create a scene, nodes, properties, scripts, groups, and signal connections from one structured spec', {
    scenePath,
    rootNodeType: { type: 'string', description: 'Root node class, default Node2D' },
    rootName: { type: 'string', description: 'Root node name, default root' },
    rootProperties: { type: 'object', description: 'Properties to set on the root node' },
    nodes: {
      type: 'array',
      items: { type: 'object' },
      description: 'Node specs: { parentNodePath, nodeType, nodeName, properties, scriptPath, groups }',
    },
    connections: {
      type: 'array',
      items: { type: 'object' },
      description: 'Signal specs: { sourceNodePath, signalName, targetNodePath, methodName }',
    },
  }, ['scenePath']),
  tool('configure_project_settings', 'Apply multiple project settings, rendering settings, layer names, input actions, and autoloads in one pass', {
    settings: { type: 'object', description: 'Arbitrary ProjectSettings key/value pairs' },
    mainScene: { type: 'string', description: 'Optional main scene path' },
    displaySize: { type: 'object', description: '{ width, height, mode? }' },
    renderingSettings: { type: 'object', description: 'Project settings under rendering/' },
    layerNames: { type: 'object', description: 'Layer groups physics2D, render2D, render3D with arrays of { index, name }' },
    inputActions: { type: 'array', items: { type: 'object' }, description: 'Input action specs' },
    autoloads: { type: 'array', items: { type: 'object' }, description: 'Autoload specs' },
  }, []),
  tool('batch_resource_edit', 'Create or edit multiple Godot resources in one pass', {
    operations: {
      type: 'array',
      items: { type: 'object' },
      description: 'Operations: create, set_properties, create_material, create_theme, create_animation_library',
    },
  }, ['operations']),

  tool('attach_script', 'Attach a GDScript to a node and save the scene', {
    scenePath,
    nodePath,
    scriptPath,
  }, ['scenePath', 'nodePath', 'scriptPath']),
  tool('inspect_script', 'Inspect a GDScript resource and list methods, properties, and signals', {
    scriptPath,
  }, ['scriptPath']),
  tool('list_script_methods', 'List methods exposed by a GDScript resource', {
    scriptPath,
  }, ['scriptPath']),
  tool('list_script_exports', 'List script variables exposed by a GDScript resource', {
    scriptPath,
  }, ['scriptPath']),
  tool('set_exported_variable', 'Set an exported script variable on a scene node and save the scene', {
    scenePath,
    nodePath,
    propertyName: { type: 'string', description: 'Exported property name' },
    value: jsonValue,
  }, ['scenePath', 'nodePath', 'propertyName', 'value']),

  tool('remove_node', 'Remove a non-root node from a scene and save it', {
    scenePath,
    nodePath,
  }, ['scenePath', 'nodePath']),
  tool('rename_node', 'Rename a node in a scene and save it', {
    scenePath,
    nodePath,
    newName: { type: 'string', description: 'New node name' },
  }, ['scenePath', 'nodePath', 'newName']),
  tool('duplicate_node', 'Duplicate a node as a sibling and save the scene', {
    scenePath,
    nodePath,
    newName: { type: 'string', description: 'Optional duplicate node name' },
  }, ['scenePath', 'nodePath']),
  tool('move_node', 'Move a node to a new sibling index and save the scene', {
    scenePath,
    nodePath,
    targetIndex: { type: 'number', description: 'New sibling index' },
  }, ['scenePath', 'nodePath', 'targetIndex']),
  tool('reparent_node', 'Reparent a node and save the scene', {
    scenePath,
    nodePath,
    newParentNodePath: { type: 'string', description: 'New parent node path' },
  }, ['scenePath', 'nodePath', 'newParentNodePath']),
  tool('find_nodes_by_type', 'Find nodes in a scene by Godot class/type', {
    scenePath,
    nodeType: { type: 'string', description: 'Godot class/type name' },
  }, ['scenePath', 'nodeType']),
  tool('find_nodes_by_script', 'Find nodes in a scene with a specific attached script', {
    scenePath,
    scriptPath,
  }, ['scenePath', 'scriptPath']),

  tool('inspect_resource', 'Inspect a Godot resource and return stored properties', {
    resourcePath,
  }, ['resourcePath']),
  tool('create_resource', 'Create a Godot Resource of a given type and save it', {
    resourceType: { type: 'string', description: 'Godot Resource class name, such as GradientTexture2D' },
    outputPath,
    properties: { type: 'object', description: 'Properties to set before saving' },
  }, ['resourceType', 'outputPath']),
  tool('set_resource_property', 'Set a property on an existing resource and save it', {
    resourcePath,
    propertyName: { type: 'string', description: 'Property name' },
    value: jsonValue,
  }, ['resourcePath', 'propertyName', 'value']),
  tool('create_material', 'Create and save a material resource', {
    outputPath,
    materialType: { type: 'string', description: 'Material resource type, default StandardMaterial3D' },
    properties: { type: 'object', description: 'Material properties' },
  }, ['outputPath']),
  tool('create_theme', 'Create and save an empty Theme resource', {
    outputPath,
  }, ['outputPath']),
  tool('create_animation_library', 'Create and save an AnimationLibrary resource', {
    outputPath,
    animations: { type: 'array', items: { type: 'string' }, description: 'Optional animation names to create' },
  }, ['outputPath']),

  tool('set_main_scene', 'Set application/run/main_scene in project settings', {
    scenePath,
  }, ['scenePath']),
  tool('set_display_size', 'Set the project viewport width and height', {
    width: { type: 'number', description: 'Viewport width' },
    height: { type: 'number', description: 'Viewport height' },
    mode: { type: 'number', description: 'Optional Godot display/window/size/mode value' },
  }, ['width', 'height']),
  tool('set_rendering_setting', 'Set a project setting under the rendering/ namespace', {
    settingName: { type: 'string', description: 'Project setting path beginning with rendering/' },
    value: jsonValue,
  }, ['settingName', 'value']),
  tool('configure_physics_layers', 'Configure 2D physics layer names', {
    layers: { type: 'array', items: { type: 'object' }, description: 'Array of { index: 1-32, name: string }' },
  }, ['layers']),
  tool('configure_2d_layers', 'Configure 2D render layer names', {
    layers: { type: 'array', items: { type: 'object' }, description: 'Array of { index: 1-32, name: string }' },
  }, ['layers']),
  tool('configure_3d_layers', 'Configure 3D render layer names', {
    layers: { type: 'array', items: { type: 'object' }, description: 'Array of { index: 1-32, name: string }' },
  }, ['layers']),

  tool('reimport_asset', 'Validate an asset and return import metadata available to the editor', {
    assetPath: resourcePath,
  }, ['assetPath']),
  tool('list_imported_assets', 'List imported assets by scanning .import metadata files', {}, []),
  tool('get_import_metadata', 'Read a single asset .import metadata file', {
    assetPath: resourcePath,
  }, ['assetPath']),

  tool('get_project_errors', 'Load scenes/scripts and scan references for project-level errors', {}, []),
  tool('get_missing_resources', 'Scan project files for res:// references that do not exist', {}, []),
  tool('find_broken_scene_references', 'Scan scenes/resources for missing res:// references', {}, []),
  tool('find_unused_assets', 'Find project asset files that are not referenced by scenes/scripts/resources', {}, []),
  tool('find_orphan_scripts', 'Find GDScript files not referenced by scenes/resources/project settings', {}, []),
  tool('check_scene_cycles', 'Find scene-to-scene reference cycles', {}, []),
];

const SPECS: Record<string, AdvancedToolSpec> = Object.fromEntries([
  ['run_scene_for_seconds', { required: ['scenePath'], pathFields: ['scenePath'], existingPathFields: ['scenePath'] }],
  ['get_runtime_scene_tree', { required: ['scenePath'], pathFields: ['scenePath'], existingPathFields: ['scenePath'] }],
  ['call_node_method', { required: ['scenePath', 'nodePath', 'methodName'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'], identifierFields: ['methodName'] }],
  ['send_input_action', { required: ['actionName'], looseNameFields: ['actionName'] }],
  ['wait_for_signal', { required: ['scenePath', 'nodePath', 'signalName'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'], identifierFields: ['signalName'] }],
  ['assert_node_property', { required: ['scenePath', 'nodePath', 'propertyName', 'expectedValue'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'], propertyFields: ['propertyName'] }],
  ['set_node_properties', { required: ['scenePath', 'changes'], pathFields: ['scenePath'], existingPathFields: ['scenePath'] }],
  ['apply_scene_operations', { required: ['scenePath', 'operations'], pathFields: ['scenePath'], existingPathFields: ['scenePath'] }],
  ['create_scene_from_spec', { required: ['scenePath'], pathFields: ['scenePath'], looseNameFields: ['rootNodeType'], identifierFields: ['rootName'] }],
  ['configure_project_settings', { required: [] }],
  ['batch_resource_edit', { required: ['operations'] }],
  ['attach_script', { required: ['scenePath', 'nodePath', 'scriptPath'], pathFields: ['scenePath', 'scriptPath'], existingPathFields: ['scenePath', 'scriptPath'], nodePathFields: ['nodePath'] }],
  ['inspect_script', { required: ['scriptPath'], pathFields: ['scriptPath'], existingPathFields: ['scriptPath'] }],
  ['list_script_methods', { required: ['scriptPath'], pathFields: ['scriptPath'], existingPathFields: ['scriptPath'] }],
  ['list_script_exports', { required: ['scriptPath'], pathFields: ['scriptPath'], existingPathFields: ['scriptPath'] }],
  ['set_exported_variable', { required: ['scenePath', 'nodePath', 'propertyName', 'value'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'], propertyFields: ['propertyName'] }],
  ['remove_node', { required: ['scenePath', 'nodePath'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'] }],
  ['rename_node', { required: ['scenePath', 'nodePath', 'newName'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'], identifierFields: ['newName'] }],
  ['duplicate_node', { required: ['scenePath', 'nodePath'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'], identifierFields: ['newName'] }],
  ['move_node', { required: ['scenePath', 'nodePath', 'targetIndex'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath'] }],
  ['reparent_node', { required: ['scenePath', 'nodePath', 'newParentNodePath'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], nodePathFields: ['nodePath', 'newParentNodePath'] }],
  ['find_nodes_by_type', { required: ['scenePath', 'nodeType'], pathFields: ['scenePath'], existingPathFields: ['scenePath'], looseNameFields: ['nodeType'] }],
  ['find_nodes_by_script', { required: ['scenePath', 'scriptPath'], pathFields: ['scenePath', 'scriptPath'], existingPathFields: ['scenePath', 'scriptPath'] }],
  ['inspect_resource', { required: ['resourcePath'], pathFields: ['resourcePath'], existingPathFields: ['resourcePath'] }],
  ['create_resource', { required: ['resourceType', 'outputPath'], pathFields: ['outputPath'], looseNameFields: ['resourceType'] }],
  ['set_resource_property', { required: ['resourcePath', 'propertyName', 'value'], pathFields: ['resourcePath'], existingPathFields: ['resourcePath'], propertyFields: ['propertyName'] }],
  ['create_material', { required: ['outputPath'], pathFields: ['outputPath'], looseNameFields: ['materialType'] }],
  ['create_theme', { required: ['outputPath'], pathFields: ['outputPath'] }],
  ['create_animation_library', { required: ['outputPath'], pathFields: ['outputPath'] }],
  ['set_main_scene', { required: ['scenePath'], pathFields: ['scenePath'], existingPathFields: ['scenePath'] }],
  ['set_display_size', { required: ['width', 'height'] }],
  ['set_rendering_setting', { required: ['settingName', 'value'], looseNameFields: ['settingName'] }],
  ['configure_physics_layers', { required: ['layers'] }],
  ['configure_2d_layers', { required: ['layers'] }],
  ['configure_3d_layers', { required: ['layers'] }],
  ['reimport_asset', { required: ['assetPath'], pathFields: ['assetPath'], existingPathFields: ['assetPath'] }],
  ['list_imported_assets', { required: [] }],
  ['get_import_metadata', { required: ['assetPath'], pathFields: ['assetPath'] }],
  ['get_project_errors', { required: [] }],
  ['get_missing_resources', { required: [] }],
  ['find_broken_scene_references', { required: [] }],
  ['find_unused_assets', { required: [] }],
  ['find_orphan_scripts', { required: [] }],
  ['check_scene_cycles', { required: [] }],
].map(([name, spec]) => [name, { name, operation: name, ...(spec as Omit<AdvancedToolSpec, 'name' | 'operation'>) }]));

export function isAdvancedTool(name: string): boolean {
  return Boolean(SPECS[name]);
}

function isMissing(value: any): boolean {
  return value === undefined || value === '';
}

function validateFields(server: any, args: any, fields: string[] | undefined, validatorName: string, label: string): any | null {
  for (const field of fields ?? []) {
    if (isMissing(args[field])) {
      continue;
    }
    if (!server[validatorName](args[field])) {
      return server.createErrorResponse(
        `Invalid ${field}`,
        [`Provide a valid ${label}`]
      );
    }
  }
  return null;
}

export async function handleAdvancedTool(server: any, name: string, rawArgs: any): Promise<any> {
  const spec = SPECS[name];
  if (!spec) {
    return null;
  }

  const args = server.normalizeParameters(rawArgs ?? {});
  const missing = spec.required.filter((field) => isMissing(args[field]));
  if (missing.length > 0) {
    return server.createErrorResponse(
      `Missing required parameters: ${missing.join(', ')}`,
      [`Provide ${missing.join(', ')}`]
    );
  }

  const projectPath = server.validateProjectPath(args.projectPath);
  if (!projectPath) {
    return server.createErrorResponse(
      'Project path is not allowed',
      ['Set GODOT_PROJECT_ROOT to your Godot project directory or GODOT_PROJECT_ROOTS to allowed parent directories']
    );
  }
  args.projectPath = projectPath;

  if (!server.validateProjectFile(args.projectPath)) {
    return server.createErrorResponse(
      `Not a valid Godot project: ${args.projectPath}`,
      ['Ensure the path points to a directory containing a project.godot file']
    );
  }

  const pathValidationError = validateFields(server, args, spec.pathFields, 'validatePath', 'project-relative path');
  if (pathValidationError) return pathValidationError;

  const nodePathValidationError = validateFields(server, args, spec.nodePathFields, 'validateNodePath', 'node path');
  if (nodePathValidationError) return nodePathValidationError;

  const identifierValidationError = validateFields(server, args, spec.identifierFields, 'validateIdentifier', 'identifier');
  if (identifierValidationError) return identifierValidationError;

  const looseNameValidationError = validateFields(server, args, spec.looseNameFields, 'validateLooseName', 'name');
  if (looseNameValidationError) return looseNameValidationError;

  const propertyValidationError = validateFields(server, args, spec.propertyFields, 'validatePropertyName', 'property name');
  if (propertyValidationError) return propertyValidationError;

  for (const field of spec.existingPathFields ?? []) {
    if (!server.validateExistingProjectRelativeFile(args.projectPath, args[field])) {
      return server.createErrorResponse(
        `File does not exist: ${args[field]}`,
        ['Ensure the path is correct and relative to the allowed Godot project']
      );
    }
  }

  if (name === 'set_rendering_setting' && !String(args.settingName).startsWith('rendering/')) {
    return server.createErrorResponse(
      'Invalid settingName',
      ['Rendering settings must start with rendering/']
    );
  }

  try {
    const params = { ...args };
    delete params.projectPath;

    const { stdout, stderr } = await server.executeOperation(spec.operation, params, args.projectPath);
    if (stderr && !server.extractJsonFromOperationOutput(stdout)) {
      return server.createErrorResponse(
        `Failed to execute ${name}: ${stderr}`,
        ['Check the tool arguments and verify Godot can load the referenced project resources']
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: server.formatOperationJsonOutput(stdout),
        },
      ],
    };
  } catch (error: any) {
    return server.createErrorResponse(
      `Failed to execute ${name}: ${error?.message || 'Unknown error'}`,
      [
        'Ensure Godot is installed correctly',
        'Check if the GODOT_PATH environment variable is set correctly',
        'Verify the project path is accessible',
      ]
    );
  }
}
