import fs from 'fs-extra';
import path from 'path';
import {fileURLToPath} from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Remove retired generated entry points from incremental builds and npm packages.
for (const relativePath of ['advancedTools.js', 'scripts/operations/advanced_operations.gd']) {
    const legacyFile = path.join(__dirname, '..', 'build', relativePath);
    if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile);
}

// Make the build/index.js file executable
fs.chmodSync(path.join(__dirname, '..', 'build', 'index.js'), '755');

// Copy the scripts directory to the build directory
try {
    const sourceScriptsDir = path.join(__dirname, '..', 'src', 'scripts');
    const buildScriptsDir = path.join(__dirname, '..', 'build', 'scripts');

    fs.ensureDirSync(buildScriptsDir);
    fs.copySync(sourceScriptsDir, buildScriptsDir, {overwrite: true});

    console.log('Successfully copied scripts to build/scripts');
} catch (error) {
    console.error('Error copying scripts:', error);
    process.exit(1);
}

console.log('Build scripts completed successfully!');
