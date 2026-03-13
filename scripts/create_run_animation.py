"""
Blender 5.0 script: create a custom walk/run animation for the Kenney character.
Natural walk cycle with arms at sides, subtle arm swing, and smooth leg motion.

Usage:
    blender --background --python scripts/create_run_animation.py -- <skin_name> <output_dir>

Examples:
    blender --background --python scripts/create_run_animation.py -- survivorMaleB packages/client/public/models/characters/player
    blender --background --python scripts/create_run_animation.py -- zombieA packages/client/public/models/characters/zombie
"""
import bpy
import os
import sys
import math
from mathutils import Quaternion, Vector

# Parse CLI args after "--"
argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
SKIN_NAME = args[0] if len(args) > 0 else "survivorMaleB"
OUT_DIR = args[1] if len(args) > 1 else "packages/client/public/models/characters/player"

SRC = os.path.join(os.getcwd(), "assets", "kenney-characters")
MODEL_FBX = os.path.join(SRC, "Model", "characterMedium.fbx")
SKIN = os.path.join(SRC, "Skins", f"{SKIN_NAME}.png")
DST = os.path.join(os.getcwd(), OUT_DIR, "run.glb")
os.makedirs(os.path.dirname(DST), exist_ok=True)
print(f"Skin: {SKIN_NAME}, Output: {DST}")

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
    """
    rest_bone = pose_bone.bone
    bone_dir = (rest_bone.tail_local - rest_bone.head_local).normalized()
    up = Vector((0, 0, 1))
    forward = bone_dir.cross(up).normalized()
    rest_mat = rest_bone.matrix_local.to_3x3()
    local_axis = rest_mat.inverted() @ forward
    return Quaternion(local_axis, math.radians(-down_angle_deg))


def get_sagittal_rotation(pose_bone, angle_deg):
    """
    Compute a quaternion for forward/back rotation in the sagittal plane.
    Rotates around the bone-local equivalent of the world X (lateral) axis.
    Positive angle = forward swing, negative = backward.
    """
    rest_bone = pose_bone.bone
    rest_mat = rest_bone.matrix_local.to_3x3()
    # World X axis = lateral direction; transform to bone-local space
    local_x = (rest_mat.inverted() @ Vector((1, 0, 0))).normalized()
    return Quaternion(local_x, math.radians(angle_deg))


# Pre-compute base arm poses (arms down, same as idle)
ARM_DOWN_ANGLE = 75
FOREARM_BEND = 12

left_arm_base = get_arm_down_rotation(pb["LeftArm"], ARM_DOWN_ANGLE)
right_arm_base = get_arm_down_rotation(pb["RightArm"], ARM_DOWN_ANGLE)
left_forearm_base = get_arm_down_rotation(pb["LeftForeArm"], FOREARM_BEND)
right_forearm_base = get_arm_down_rotation(pb["RightForeArm"], FOREARM_BEND)

# --- Walk cycle parameters ---
TOTAL_FRAMES = 30       # 1 second at 30fps
CYCLE_FRAMES = 30       # Full stride cycle

# Leg swing amplitudes
UPLEG_SWING = 20        # degrees: thigh forward/back swing
KNEE_BEND_BASE = 5      # degrees: baseline knee bend
KNEE_BEND_SWING = 25    # degrees: extra knee bend during swing phase
FOOT_FLEX = 8           # degrees: foot dorsiflexion during swing

# Arm swing (opposite to legs)
ARM_SWING = 12          # degrees: arm forward/back swing
FOREARM_EXTRA = 8       # degrees: extra forearm bend on backswing

# Body motion
HIP_BOB = 0.015         # vertical hip displacement
SPINE_TWIST = 2.5       # degrees: spine counter-rotation
SPINE_LEAN = 3          # degrees: slight forward lean
CHEST_TWIST = 1.5       # degrees: chest twist

bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = TOTAL_FRAMES
bpy.context.scene.render.fps = 30

for frame in range(TOTAL_FRAMES + 1):
    bpy.context.scene.frame_set(frame)
    phase = 2 * math.pi * frame / CYCLE_FRAMES

    # --- Legs ---
    # Left leg: forward at phase=0, back at phase=pi
    left_upleg_angle = math.sin(phase) * UPLEG_SWING
    right_upleg_angle = math.sin(phase + math.pi) * UPLEG_SWING

    # Knee bend: peaks during swing (when leg is moving forward)
    # swing phase for left = phase in [pi, 2pi], for right = phase in [0, pi]
    left_knee_extra = max(0, math.sin(phase - math.pi / 2)) * KNEE_BEND_SWING
    right_knee_extra = max(0, math.sin(phase + math.pi / 2)) * KNEE_BEND_SWING
    left_knee = KNEE_BEND_BASE + left_knee_extra
    right_knee = KNEE_BEND_BASE + right_knee_extra

    # Foot flexion: lift toes during swing
    left_foot_angle = max(0, math.sin(phase - math.pi / 2)) * FOOT_FLEX
    right_foot_angle = max(0, math.sin(phase + math.pi / 2)) * FOOT_FLEX

    # LeftUpLeg
    if "LeftUpLeg" in pb:
        b = pb["LeftUpLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, left_upleg_angle)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # RightUpLeg
    if "RightUpLeg" in pb:
        b = pb["RightUpLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, right_upleg_angle)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # LeftLeg (knee — always positive bend)
    if "LeftLeg" in pb:
        b = pb["LeftLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, -left_knee)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # RightLeg (knee)
    if "RightLeg" in pb:
        b = pb["RightLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, -right_knee)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # LeftFoot
    if "LeftFoot" in pb:
        b = pb["LeftFoot"]
        b.rotation_quaternion = get_sagittal_rotation(b, left_foot_angle)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # RightFoot
    if "RightFoot" in pb:
        b = pb["RightFoot"]
        b.rotation_quaternion = get_sagittal_rotation(b, right_foot_angle)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # --- Arms (opposite to legs) ---
    # Left arm swings forward when right leg is forward (sagittal plane swing)
    left_arm_swing = get_sagittal_rotation(pb["LeftArm"], math.sin(phase + math.pi) * ARM_SWING)
    right_arm_swing = get_sagittal_rotation(pb["RightArm"], math.sin(phase) * ARM_SWING)

    if "LeftArm" in pb:
        b = pb["LeftArm"]
        b.rotation_quaternion = left_arm_base @ left_arm_swing
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "RightArm" in pb:
        b = pb["RightArm"]
        b.rotation_quaternion = right_arm_base @ right_arm_swing
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Forearms: extra bend on backswing
    left_extra = max(0, math.sin(phase)) * FOREARM_EXTRA
    right_extra = max(0, math.sin(phase + math.pi)) * FOREARM_EXTRA

    if "LeftForeArm" in pb:
        b = pb["LeftForeArm"]
        b.rotation_quaternion = left_forearm_base @ get_sagittal_rotation(pb["LeftForeArm"], left_extra)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "RightForeArm" in pb:
        b = pb["RightForeArm"]
        b.rotation_quaternion = right_forearm_base @ get_sagittal_rotation(pb["RightForeArm"], right_extra)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # --- Body ---
    # Hip vertical bob: lowest at contact (phase=0, pi), highest at mid-stride
    hip_bob = -abs(math.sin(phase)) * HIP_BOB
    if "HipsCtrl" in pb:
        b = pb["HipsCtrl"]
        b.location.y = hip_bob
        b.keyframe_insert(data_path="location", frame=frame)

    # Spine: slight forward lean + twist counter-rotation to hips
    spine_lean = Quaternion((1, 0, 0), math.radians(SPINE_LEAN))
    spine_twist = Quaternion((0, 0, 1), math.sin(phase) * math.radians(SPINE_TWIST))
    if "Spine" in pb:
        b = pb["Spine"]
        b.rotation_quaternion = spine_lean @ spine_twist
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Chest twist (opposite to spine for natural counter-rotation)
    chest_twist = Quaternion((0, 0, 1), math.sin(phase + math.pi) * math.radians(CHEST_TWIST))
    if "Chest" in pb:
        b = pb["Chest"]
        b.rotation_quaternion = chest_twist
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Head: stable with very subtle sway
    head_angle = math.sin(phase * 2) * math.radians(1)
    if "Head" in pb:
        b = pb["Head"]
        b.rotation_quaternion = Quaternion((0, 1, 0), head_angle)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

bpy.ops.object.mode_set(mode='OBJECT')

# Rename the action
for act in bpy.data.actions:
    if "Targeting Pose" not in act.name:
        act.name = "run"
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
