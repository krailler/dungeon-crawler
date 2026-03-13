"""
Blender 5.0 script: convert Kenney Animated Characters FBX → GLB.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/convert_kenney_fbx.py -- <src_dir> <dst_dir> <skin_name>

Example:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/convert_kenney_fbx.py \
    -- assets/kenney-characters packages/client/public/models/character survivorMaleB

Each animation FBX is imported directly (contains mesh + skeleton + animation)
and exported as one GLB per animation. The real animation action is kept
(skips the "Targeting Pose" rest action).

Note: Blender 5.0 uses layered actions — moving actions between armatures
doesn't work reliably. Instead, we import each animation FBX directly.
"""
import bpy
import os
import sys

# Parse arguments after "--"
argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
if len(args) < 3:
    print("Usage: ... -- <src_dir> <dst_dir> <skin_name>")
    print("  src_dir:   path to kenney_animated-characters-1 folder")
    print("  dst_dir:   output directory for GLB files")
    print("  skin_name: skin filename without extension (e.g. survivorMaleB)")
    sys.exit(1)

SRC = args[0]
DST = args[1]
SKIN_NAME = args[2]
SKIN = os.path.join(SRC, "Skins", f"{SKIN_NAME}.png")

ANIM_DIR = os.path.join(SRC, "Animations")

os.makedirs(DST, exist_ok=True)


def clear_scene():
    """Remove all objects and orphan data blocks."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in [
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.armatures,
        bpy.data.actions,
    ]:
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def apply_skin(skin_path):
    """Apply the skin texture to all materials via Principled BSDF."""
    img = bpy.data.images.load(skin_path)
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = None
        for node in nodes:
            if node.type == "BSDF_PRINCIPLED":
                bsdf = node
                break
        if not bsdf:
            continue
        tex_node = nodes.new("ShaderNodeTexImage")
        tex_node.image = img
        links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])


def export_glb(anim_name, fbx_path):
    """Import animation FBX directly, apply skin, export GLB."""
    clear_scene()

    # Import animation FBX directly (contains mesh + skeleton + animation)
    bpy.ops.import_scene.fbx(filepath=fbx_path, use_anim=True)

    # Find armature
    armature = None
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            armature = obj
            break
    if not armature:
        print(f"ERROR: No armature found")
        return

    # Find the real animation action (skip "Targeting Pose")
    real_action = None
    for act in bpy.data.actions:
        if "Targeting Pose" not in act.name:
            real_action = act
            break

    if not real_action:
        print(f"WARNING: No animation found in {fbx_path}")
        return

    # Set as active action and rename
    if not armature.animation_data:
        armature.animation_data_create()
    armature.animation_data.action = real_action
    real_action.name = anim_name
    fr = real_action.frame_range
    print(f"  Animation: {anim_name} frames={fr[0]:.0f}-{fr[1]:.0f}")

    # Remove unwanted actions (Targeting Pose etc.)
    for act in list(bpy.data.actions):
        if act != real_action:
            bpy.data.actions.remove(act)

    # Apply skin
    apply_skin(SKIN)

    # Set frame range for export
    bpy.context.scene.frame_start = int(fr[0])
    bpy.context.scene.frame_end = int(fr[1])

    # Export
    bpy.ops.object.select_all(action="SELECT")
    out_path = os.path.join(DST, f"{anim_name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_skins=True,
        export_image_format="AUTO",
    )
    print(f"  Exported: {out_path}")


# Discover all animation FBX files
anim_files = sorted(
    f for f in os.listdir(ANIM_DIR) if f.endswith(".fbx")
)
print(f"Found {len(anim_files)} animations: {[f[:-4] for f in anim_files]}")

for fbx_file in anim_files:
    anim_name = os.path.splitext(fbx_file)[0]
    fbx_path = os.path.join(ANIM_DIR, fbx_file)
    print(f"\n=== {anim_name} ===")
    export_glb(anim_name, fbx_path)

print("\nDone!")
