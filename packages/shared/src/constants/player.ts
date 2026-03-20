/** Maximum number of players in a dungeon room */
export const MAX_PARTY_SIZE = 5;
export const ATTACK_ANIM_DURATION = 0.67;
/** Damage is applied at the midpoint of the attack animation */
export const DAMAGE_DELAY = ATTACK_ANIM_DURATION / 2;
/** Minimum attack cooldown regardless of agility */
export const MIN_ATTACK_COOLDOWN = 0.3;
/** Global cooldown: using any active skill locks all other skills for this duration */
export const GCD_DURATION = 1.0;
/** Distance threshold for players to snap to a waypoint (tight for precise movement) */
export const PLAYER_WAYPOINT_THRESHOLD = 0.01;
