"""
Blender 5.0 script: create a custom idle animation for the Kenney character.
Arms resting at sides + subtle breathing motion.
Computes bone-local rotation axes from the armature rest pose for accuracy.

Usage:
    blender --background --python scripts/create_idle_animation.py

Requires Kenney Animated Characters pack at SRC path below.
Outputs idle.glb to packages/client/public/models/character/idle.glb
"""
import bpy
import os
import math
from mathutils import Quaternion, Vector

SRC = os.path.join(os.getcwd(), "assets", "kenney-characters")
MODEL_FBX = os.path.join(SRC, "Model", "characterMedium.fbx")
SKIN = os.path.join(SRC, "Skins", "survivorMaleB.png")
DST = os.path.join(os.getcwd(), "packages/client/public/models/character/idle.glb")

# --- Clean scene ---
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for collection in [bpy.data.meshes, bpy.data.materials, bpy.data.images,
                   bpy.data.armatures, bpy.data.actions]:
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

# --- Import model ---
bpy.ops.import_scene.fbx(filepath=MODEL_FBX, use_anim=False)

armature = None
for obj in bpy.context.scene.objects:
    if obj.type == "ARMATURE":
        armature = obj
        break

if not armature:
    raise SystemExit("ERROR: No armature found")

# --- Apply skin ---
img = bpy.data.images.load(SKIN)
for mat in bpy.data.materials:
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        continue
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = img
    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

# --- Pose setup ---
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode='POSE')
pb = armature.pose.bones


def get_arm_down_rotation(pose_bone, down_angle_deg):
    """
    Compute a quaternion that rotates an arm bone downward from its T-pose
    rest position by the given angle in degrees.

    Works by finding the forward axis (perpendicular to bone direction and
    world up) in bone-local space, then rotating by a negative angle around it.
    """
    rest_bone = pose_bone.bone
    bone_dir = (rest_bone.tail_local - rest_bone.head_local).normalized()
    up = Vector((0, 0, 1))
    forward = bone_dir.cross(up).normalized()
    rest_mat = rest_bone.matrix_local.to_3x3()
    local_axis = rest_mat.inverted() @ forward
    # Negative angle = downward rotation from T-pose
    return Quaternion(local_axis, math.radians(-down_angle_deg))


# Pre-compute arm quaternions
ARM_DOWN_ANGLE = 75   # degrees to rotate arms down from T-pose
FOREARM_BEND = 12     # slight elbow bend

left_arm_q = get_arm_down_rotation(pb["LeftArm"], ARM_DOWN_ANGLE)
right_arm_q = get_arm_down_rotation(pb["RightArm"], ARM_DOWN_ANGLE)
left_forearm_q = get_arm_down_rotation(pb["LeftForeArm"], FOREARM_BEND)
right_forearm_q = get_arm_down_rotation(pb["RightForeArm"], FOREARM_BEND)

# --- Create idle animation ---
TOTAL_FRAMES = 60
BREATH_CYCLE = 60

bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = TOTAL_FRAMES
bpy.context.scene.render.fps = 30

for frame in range(TOTAL_FRAMES + 1):
    bpy.context.scene.frame_set(frame)
    breath = math.sin(2 * math.pi * frame / BREATH_CYCLE)

    # Subtle arm sway with breathing
    sway_q_left = get_arm_down_rotation(pb["LeftArm"], 2 * breath)
    sway_q_right = get_arm_down_rotation(pb["RightArm"], 2 * breath)

    # Left arm
    if "LeftArm" in pb:
        b = pb["LeftArm"]
        b.rotation_quaternion = left_arm_q @ sway_q_left
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "LeftForeArm" in pb:
        b = pb["LeftForeArm"]
        b.rotation_quaternion = left_forearm_q
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Right arm
    if "RightArm" in pb:
        b = pb["RightArm"]
        b.rotation_quaternion = right_arm_q @ sway_q_right
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "RightForeArm" in pb:
        b = pb["RightForeArm"]
        b.rotation_quaternion = right_forearm_q
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Breathing — subtle spine/chest rotation
    spine_q = Quaternion((1, 0, 0), breath * math.radians(1.5))
    chest_q = Quaternion((1, 0, 0), breath * math.radians(0.8))

    if "Spine" in pb:
        b = pb["Spine"]
        b.rotation_quaternion = spine_q
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "Chest" in pb:
        b = pb["Chest"]
        b.rotation_quaternion = chest_q
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Hips: very subtle vertical bob
    if "HipsCtrl" in pb:
        b = pb["HipsCtrl"]
        b.location.y = breath * 0.008
        b.keyframe_insert(data_path="location", frame=frame)

    # Head subtle sway (slower cycle)
    head_angle = math.sin(2 * math.pi * frame / (BREATH_CYCLE * 2)) * math.radians(3)
    if "Head" in pb:
        b = pb["Head"]
        b.rotation_quaternion = Quaternion((0, 1, 0), head_angle)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

bpy.ops.object.mode_set(mode='OBJECT')

# Rename the action
for act in bpy.data.actions:
    if "Targeting Pose" not in act.name:
        act.name = "idle"
        print(f"Action: {act.name} range={act.frame_range}")
        break

# --- Export ---
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=DST,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_skins=True,
    export_image_format="AUTO",
)
print(f"Exported: {DST}")
