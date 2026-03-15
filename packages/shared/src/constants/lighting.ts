// Lighting
export const AMBIENT_INTENSITY = 0.2;
export const TORCH_INTENSITY = 2.0;
export const TORCH_RANGE = 14;
export const TORCH_ANGLE = Math.PI / 2.5;
export const WALL_TORCH_INTENSITY = 0.8;
export const WALL_TORCH_RANGE = 6;
export const WALL_TORCH_CHANCE = 0.18;

// Spawn room light
export const SPAWN_LIGHT_INTENSITY = 1.2;
export const SPAWN_LIGHT_RANGE = 12;

// Fog of war
export const FOG_INNER_RADIUS = 1;
export const FOG_OUTER_RADIUS = 7;
/** Expanded fog radii at the spawn room (more visibility) */
export const FOG_SPAWN_INNER_RADIUS = 6;
export const FOG_SPAWN_OUTER_RADIUS = 14;
/** Distance from spawn at which fog transitions fully to default values */
export const FOG_SPAWN_TRANSITION = 10;
