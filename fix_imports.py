import os
import re

mappings = {
    "database.js": "core/database.js",
    "database.types.js": "core/database.types.js",
    "config.js": "core/config.js",
    "plugin-loader.js": "core/plugin-loader.js",
    "maintenance.js": "modules/catalog/maintenance.startup.js",
    "utils.js": "common/network.js",
    "validators.js": "common/validators.js",
    "price.js": "modules/catalog/price.js"
}

server_root = os.path.abspath("src/server")

def get_new_import(file_path, old_import_path):
    # old_import_path is something like "../../database.js"
    # we want to find what it pointed to.
    # It always pointed to a file that WAS in src/server root.
    
    # Calculate the absolute path of the directory containing the file
    file_dir = os.path.dirname(os.path.abspath(file_path))
    
    # The old import path pointed to src/server/OLD_FILE
    # Extract the filename from the old import path
    filename = os.path.basename(old_import_path)
    if filename not in mappings:
        return None
    
    new_path_from_server_root = mappings[filename]
    abs_new_path = os.path.join(server_root, new_path_from_server_root)
    
    # Calculate relative path from file_dir to abs_new_path
    rel_new_path = os.path.relpath(abs_new_path, file_dir).replace("\\", "/")
    
    if not rel_new_path.startswith("."):
        rel_new_path = "./" + rel_new_path
        
    return rel_new_path

def process_file(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    original_content = content
    
    # Match imports like: from "../../database.js" or import("../../database.js")
    # Using a regex that captures the path
    pattern = r'([\'"])((\.\.?/)*(' + "|".join(re.escape(k) for k in mappings.keys()) + r'))\1'
    
    def replace_match(match):
        quote = match.group(1)
        old_path = match.group(2)
        new_path = get_new_import(file_path, old_path)
        if new_path:
            return f"{quote}{new_path}{quote}"
        return match.group(0)
    
    new_content = re.sub(pattern, replace_match, content)
    
    if new_content != original_content:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {file_path}")

for root, dirs, files in os.walk(server_root):
    for file in files:
        if file.endswith(".ts") or file.endswith(".tsx"):
            process_file(os.path.join(root, file))
