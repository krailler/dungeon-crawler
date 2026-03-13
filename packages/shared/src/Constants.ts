// World
export const TILE_SIZE = 2;

// Dungeon generation
export const DUNGEON_WIDTH = 40;
export const DUNGEON_HEIGHT = 40;
export const DUNGEON_ROOMS = 7;

// Player
export const PLAYER_SPEED = 5;
export const PLAYER_HEALTH = 100;
export const PLAYER_ATTACK_DAMAGE = 10;
export const PLAYER_ATTACK_RANGE = 2.5;
export const PLAYER_ATTACK_COOLDOWN = 1.0;

// Enemy
export const ENEMY_SPEED = 3;
export const ENEMY_HEALTH = 30;
export const ENEMY_DETECTION_RANGE = 12;
export const ENEMY_ATTACK_RANGE = 2.5;
export const ENEMY_ATTACK_COOLDOWN = 1.5;
export const ENEMY_ATTACK_DAMAGE = 8;
export const ENEMY_REPATH_INTERVAL = 0.5;

// Wall
export const WALL_HEIGHT = 3;
export const WALL_DEPTH = 0.2;

// Lighting
export const AMBIENT_INTENSITY = 0.2;
export const TORCH_INTENSITY = 2.0;
export const TORCH_RANGE = 14;
export const TORCH_ANGLE = Math.PI / 2.5;
export const WALL_TORCH_INTENSITY = 0.8;
export const WALL_TORCH_RANGE = 6;
export const WALL_TORCH_CHANCE = 0.18;

// Fog of war
export const FOG_INNER_RADIUS = 4;
export const FOG_OUTER_RADIUS = 12;

// Camera (client-only but shared for consistency)
export const CAMERA_ALPHA = -Math.PI / 4;
export const CAMERA_BETA = Math.PI / 3;
export const CAMERA_RADIUS = 15;
export const CAMERA_RADIUS_MIN = 15;
export const CAMERA_RADIUS_MAX = 15;
export const CAMERA_FOLLOW_SPEED = 0.1;
