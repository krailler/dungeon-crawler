"""
Blender 5.0 script: create a low punch attack animation for the Kenney character.
One-shot animation (~0.67s) — right arm punches forward and down.

Usage:
    blender --background --python scripts/create_punch_animation.py -- <skin_name> <output_dir>

Examples:
    blender --background --python scripts/create_punch_animation.py -- survivorMaleB packages/client/public/models/characters/player
    blender --background --python scripts/create_punch_animation.py -- zombieA packages/client/public/models/characters/zombie
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
DST = os.path.join(os.getcwd(), OUT_DIR, "punch.glb")
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
    """Rotate arm downward from T-pose rest position."""
    rest_bone = pose_bone.bone
    bone_dir = (rest_bone.tail_local - rest_bone.head_local).normalized()
    up = Vector((0, 0, 1))
    forward = bone_dir.cross(up).normalized()
    rest_mat = rest_bone.matrix_local.to_3x3()
    local_axis = rest_mat.inverted() @ forward
    return Quaternion(local_axis, math.radians(-down_angle_deg))


def get_sagittal_rotation(pose_bone, angle_deg):
    """Rotation in sagittal plane (forward/back) around bone-local X axis."""
    rest_bone = pose_bone.bone
    rest_mat = rest_bone.matrix_local.to_3x3()
    local_x = (rest_mat.inverted() @ Vector((1, 0, 0))).normalized()
    return Quaternion(local_x, math.radians(angle_deg))


def get_twist_rotation(pose_bone, angle_deg):
    """Rotation around the bone's own axis (Y in bone-local space for spine twist)."""
    rest_bone = pose_bone.bone
    rest_mat = rest_bone.matrix_local.to_3x3()
    local_y = (rest_mat.inverted() @ Vector((0, 1, 0))).normalized()
    return Quaternion(local_y, math.radians(angle_deg))


# Pre-compute base arm poses (arms down, same as idle)
ARM_DOWN_ANGLE = 75
FOREARM_BEND = 12

left_arm_base = get_arm_down_rotation(pb["LeftArm"], ARM_DOWN_ANGLE)
right_arm_base = get_arm_down_rotation(pb["RightArm"], ARM_DOWN_ANGLE)
left_forearm_base = get_arm_down_rotation(pb["LeftForeArm"], FOREARM_BEND)
right_forearm_base = get_arm_down_rotation(pb["RightForeArm"], FOREARM_BEND)

# --- Punch animation parameters ---
TOTAL_FRAMES = 20       # ~0.67 seconds at 30fps
WINDUP_END = 5          # frames 0-5: wind-up
PUNCH_PEAK = 10         # frame 10: max extension
RETRACT_END = 20        # frames 10-20: retraction

# Right arm punch angles (negative = forward in sagittal plane for right arm)
PUNCH_FORWARD = -90     # degrees: arm swings forward
PUNCH_DOWN = 5          # degrees: slight extra downward for "low punch"
FOREARM_EXTEND = 55     # degrees: straighten forearm (positive = extend forward)
WINDUP_BACK = 20        # degrees: arm pulls back during windup

# Body motion
SPINE_LEAN_MAX = 3      # degrees: subtle lean (avoid headbutt look)
SPINE_TWIST_MAX = 5     # degrees: torso twists into punch
HIP_FORWARD = 0.01      # hip displacement forward at peak
CHEST_TWIST_MAX = 3     # degrees: chest follows through

bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = TOTAL_FRAMES
bpy.context.scene.render.fps = 30

for frame in range(TOTAL_FRAMES + 1):
    bpy.context.scene.frame_set(frame)

    # Compute normalized phase for each segment
    if frame <= WINDUP_END:
        # Wind-up: 0 → 1
        t_windup = frame / WINDUP_END
        t_punch = 0
        t_retract = 0
    elif frame <= PUNCH_PEAK:
        # Punch extension: 0 → 1
        t_windup = 1
        t_punch = (frame - WINDUP_END) / (PUNCH_PEAK - WINDUP_END)
        t_retract = 0
    else:
        # Retraction: 0 → 1
        t_windup = 0
        t_punch = 0
        t_retract = (frame - PUNCH_PEAK) / (RETRACT_END - PUNCH_PEAK)

    # --- Right arm (punching arm) ---
    if frame <= WINDUP_END:
        # Pull back slightly
        arm_angle = t_windup * WINDUP_BACK
        forearm_extra = 0
    elif frame <= PUNCH_PEAK:
        # Swing forward with easing (sine ease-out)
        ease = math.sin(t_punch * math.pi / 2)
        arm_angle = WINDUP_BACK + ease * (PUNCH_FORWARD - WINDUP_BACK)
        forearm_extra = ease * FOREARM_EXTEND
    else:
        # Retract back to base (ease-in-out)
        ease = (1 - math.cos(t_retract * math.pi)) / 2
        arm_angle = PUNCH_FORWARD * (1 - ease)
        forearm_extra = FOREARM_EXTEND * (1 - ease)

    # Right arm: arms-down base, then swing forward in sagittal plane
    if "RightArm" in pb:
        b = pb["RightArm"]
        punch_swing = get_sagittal_rotation(b, arm_angle)
        # Slight extra downward at peak for "low punch" feel
        down_extra = 0
        if frame > WINDUP_END and frame <= PUNCH_PEAK:
            down_extra = math.sin(t_punch * math.pi / 2) * PUNCH_DOWN
        elif frame > PUNCH_PEAK:
            down_extra = PUNCH_DOWN * (1 - (1 - math.cos(t_retract * math.pi)) / 2)
        down_rot = get_arm_down_rotation(pb["RightArm"], ARM_DOWN_ANGLE + down_extra)
        # Apply: first rotate arm down, then swing forward from that position
        b.rotation_quaternion = punch_swing @ down_rot
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Right forearm: extend during punch
    if "RightForeArm" in pb:
        b = pb["RightForeArm"]
        extend = get_sagittal_rotation(b, forearm_extra)
        b.rotation_quaternion = right_forearm_base @ extend
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # --- Left arm (stable, slight guard raise) ---
    if "LeftArm" in pb:
        b = pb["LeftArm"]
        # Slight guard raise during punch
        guard = 0
        if frame > WINDUP_END and frame <= PUNCH_PEAK:
            guard = math.sin(t_punch * math.pi / 2) * 5
        elif frame > PUNCH_PEAK:
            guard = 5 * (1 - (1 - math.cos(t_retract * math.pi)) / 2)
        guard_rot = get_sagittal_rotation(b, guard)
        b.rotation_quaternion = left_arm_base @ guard_rot
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "LeftForeArm" in pb:
        b = pb["LeftForeArm"]
        # Slight extra bend for guard
        guard_bend = 0
        if frame > WINDUP_END and frame <= PUNCH_PEAK:
            guard_bend = math.sin(t_punch * math.pi / 2) * 8
        elif frame > PUNCH_PEAK:
            guard_bend = 8 * (1 - (1 - math.cos(t_retract * math.pi)) / 2)
        b.rotation_quaternion = left_forearm_base @ get_sagittal_rotation(b, -guard_bend)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # --- Body ---
    # Spine: lean forward + twist into punch
    if frame <= WINDUP_END:
        lean = t_windup * 1  # very subtle anticipation lean
        twist = -t_windup * 2  # wind up: twist away
    elif frame <= PUNCH_PEAK:
        ease = math.sin(t_punch * math.pi / 2)
        lean = 2 + ease * (SPINE_LEAN_MAX - 2)
        twist = -3 + ease * (SPINE_TWIST_MAX + 3)  # twist into punch
    else:
        ease = (1 - math.cos(t_retract * math.pi)) / 2
        lean = SPINE_LEAN_MAX * (1 - ease)
        twist = SPINE_TWIST_MAX * (1 - ease)

    if "Spine" in pb:
        b = pb["Spine"]
        lean_q = Quaternion((1, 0, 0), math.radians(lean))
        twist_q = Quaternion((0, 0, 1), math.radians(twist))
        b.rotation_quaternion = lean_q @ twist_q
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # Chest: follow through twist
    if "Chest" in pb:
        b = pb["Chest"]
        chest_twist = 0
        if frame > WINDUP_END and frame <= PUNCH_PEAK:
            chest_twist = math.sin(t_punch * math.pi / 2) * CHEST_TWIST_MAX
        elif frame > PUNCH_PEAK:
            chest_twist = CHEST_TWIST_MAX * (1 - (1 - math.cos(t_retract * math.pi)) / 2)
        b.rotation_quaternion = Quaternion((0, 0, 1), math.radians(chest_twist))
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # HipsCtrl: slight forward lunge
    if "HipsCtrl" in pb:
        b = pb["HipsCtrl"]
        hip_fwd = 0
        if frame > WINDUP_END and frame <= PUNCH_PEAK:
            hip_fwd = math.sin(t_punch * math.pi / 2) * HIP_FORWARD
        elif frame > PUNCH_PEAK:
            hip_fwd = HIP_FORWARD * (1 - (1 - math.cos(t_retract * math.pi)) / 2)
        b.location.y = -hip_fwd  # negative Y = forward in Blender
        b.location.z = -abs(hip_fwd) * 0.3  # slight crouch
        b.keyframe_insert(data_path="location", frame=frame)

    # Head: stable, barely perceptible dip
    if "Head" in pb:
        b = pb["Head"]
        head_dip = 0
        if frame > WINDUP_END and frame <= PUNCH_PEAK:
            head_dip = math.sin(t_punch * math.pi / 2) * 1
        elif frame > PUNCH_PEAK:
            head_dip = 1 * (1 - (1 - math.cos(t_retract * math.pi)) / 2)
        b.rotation_quaternion = Quaternion((1, 0, 0), math.radians(head_dip))
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    # --- Legs (stable stance, slight weight shift) ---
    # Slight bend in knees for stability
    knee_bend = 0
    if frame > WINDUP_END and frame <= PUNCH_PEAK:
        knee_bend = math.sin(t_punch * math.pi / 2) * 5
    elif frame > PUNCH_PEAK:
        knee_bend = 5 * (1 - (1 - math.cos(t_retract * math.pi)) / 2)

    if "LeftUpLeg" in pb:
        b = pb["LeftUpLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, knee_bend * 0.3)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "RightUpLeg" in pb:
        b = pb["RightUpLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, knee_bend * 0.5)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "LeftLeg" in pb:
        b = pb["LeftLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, -knee_bend * 0.5)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    if "RightLeg" in pb:
        b = pb["RightLeg"]
        b.rotation_quaternion = get_sagittal_rotation(b, -knee_bend * 0.8)
        b.keyframe_insert(data_path="rotation_quaternion", frame=frame)

bpy.ops.object.mode_set(mode='OBJECT')

# Rename the action
for act in bpy.data.actions:
    if "Targeting Pose" not in act.name:
        act.name = "punch"
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
