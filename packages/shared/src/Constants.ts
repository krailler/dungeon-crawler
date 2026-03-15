// World
export const TILE_SIZE = 2;

// Dungeon generation
export const DUNGEON_WIDTH = 40;
export const DUNGEON_HEIGHT = 40;
export const DUNGEON_ROOMS = 7;

// Player — these are now derived from base stats via computeDerivedStats()
/** @deprecated Use computeDerivedStats() from Stats.ts */
export const PLAYER_SPEED = 5;
/** @deprecated Use computeDerivedStats() from Stats.ts */
export const PLAYER_HEALTH = 100;
/** @deprecated Use computeDerivedStats() from Stats.ts */
export const PLAYER_ATTACK_DAMAGE = 10;
/** @deprecated Use computeDerivedStats() from Stats.ts */
export const PLAYER_ATTACK_RANGE = 2.5;
/** @deprecated Use computeDerivedStats() from Stats.ts */
export const PLAYER_ATTACK_COOLDOWN = 1.0;
export const ATTACK_ANIM_DURATION = 0.67;

// Enemy — these are now derived from ENEMY_TYPES + computeEnemyDerivedStats()
/** @deprecated Use ENEMY_TYPES from EnemyTypes.ts */
export const ENEMY_SPEED = 3;
/** @deprecated Use ENEMY_TYPES from EnemyTypes.ts */
export const ENEMY_HEALTH = 30;
/** @deprecated Use ENEMY_TYPES from EnemyTypes.ts */
export const ENEMY_DETECTION_RANGE = 12;
/** @deprecated Use ENEMY_TYPES from EnemyTypes.ts */
export const ENEMY_ATTACK_RANGE = 2.5;
/** @deprecated Use ENEMY_TYPES from EnemyTypes.ts */
export const ENEMY_ATTACK_COOLDOWN = 1.5;
/** @deprecated Use ENEMY_TYPES from EnemyTypes.ts */
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
export const FOG_INNER_RADIUS = 1;
export const FOG_OUTER_RADIUS = 7;

// Minimap
export const MINIMAP_DISCOVERY_RADIUS = 4; // tiles revealed around player

// Camera (client-only but shared for consistency)
export const CAMERA_ALPHA = -Math.PI / 4;
export const CAMERA_BETA = (Math.PI * 3) / 11;
export const CAMERA_RADIUS = 15;
export const CAMERA_RADIUS_MIN = 15;
export const CAMERA_RADIUS_MAX = 15;
export const CAMERA_FOLLOW_SPEED = 0.1;

// Gate (lobby door)
export const GATE_INTERACT_RANGE = 4;
export const GATE_COUNTDOWN_SECONDS = 5;

// Announcements (center-screen messages)
export const ANNOUNCEMENT_FADE_MS = 3_000;

// Chat
export const CHAT_MAX_LENGTH = 200;
export const CHAT_MAX_HISTORY = 100;
export const CHAT_FADE_MS = 10_000;
export const CHAT_RATE_LIMIT_BURST = 5;
export const CHAT_RATE_LIMIT_WINDOW = 5_000;
