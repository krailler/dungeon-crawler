import { LifeState } from "@dungeon/shared";

/** Check if a player/entity is dead or downed (not alive). */
export function isEntityDead(lifeState: string | undefined, health: number): boolean {
  return lifeState === LifeState.DOWNED || lifeState === LifeState.DEAD || health <= 0;
}
