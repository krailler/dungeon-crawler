# Code Review: Equipment System — Plan de Mejoras

Revisión exhaustiva del código staged del sistema de equipamiento. Hallazgos organizados por prioridad.

---

## BUGS / Problemas Críticos

### 1. `instanceItemIds` se desincroniza en swaps

**Archivo**: `PlayerState.ts` (~línea 472-500)
**Bug**: Al hacer swap de equipo → inventario, `getItemIdForInstance()` puede devolver `""` si el mapa no tiene el mapping, corrompiendo el `itemId` del slot de inventario.
**Fix**: Actualizar `instanceItemIds` en cada operación de equip/unequip/swap. Añadir el mapping inverso cuando se crea/mueve una instancia.

### 2. `itemInstanceStore` pierde requests si `roomRef` es null

**Archivo**: `itemInstanceStore.ts` (~línea 19-36)
**Bug**: Si `flushBatch()` se ejecuta cuando `roomRef` es null, borra `pendingBatch` sin enviar nada → los IDs se pierden silenciosamente.
**Fix**: No limpiar `pendingBatch` si no se pudo enviar. Reintentar en el siguiente microtask o cuando `roomRef` se reconecte.

### 3. `formatStatValue` vs `formatStatRange` inconsistentes

**Archivos**: `statLabels.ts`, `EquipmentTooltip.tsx`
**Bug**: `formatStatValue("attackCooldown")` añade sufijo "s", pero `formatStatRange` y `formatDiff` no. El usuario ve formatos distintos para el mismo stat.
**Fix**: Unificar el formateo en `statLabels.ts` y usar desde `EquipmentTooltip.tsx`.

---

## Mejoras de Robustez (Server)

### 4. Null check en `rolledStats` (EffectSystem)

**Archivo**: `EffectSystem.ts` (~línea 214)
**Fix**: Añadir `if (!instance?.rolledStats) return;` antes de iterar.

### 5. Validar instancia existe antes de equipar (DungeonRoom)

**Archivo**: `DungeonRoom.ts` (handler EQUIP_ITEM)
**Fix**: Verificar que `getItemInstance(invSlot.instanceId)` no es undefined antes de proceder con `equipItem()`.

### 6. Level-down no desequipa items con level requirement

**Archivo**: `DungeonRoom.ts` (handler de `/setlevel`)
**Fix**: Tras reducir nivel, iterar equipment y unequip items cuyo `levelReq > newLevel`.

### 7. Clamping asimétrico en LootRoller

**Archivo**: `LootRoller.ts` (~línea 72 vs 91)
**Bug**: Stats garantizados siempre clampean a `min 1`, pero bonus affixes soportan negativos. Si un stat garantizado tiene rango negativo (ej: attackCooldown reducción), se clampearía a 1.
**Fix**: Aplicar el mismo clamping asimétrico (`entry.min < 0 ? Math.min(-1, ...) : Math.max(1, ...)`) a stats garantizados.

### 8. `deleteInstance()` es dead code

**Archivo**: `ItemInstanceRegistry.ts` (~línea 41-44)
**Fix**: Eliminar o implementar correctamente (también borrar de DB).

### 9. try-catch en equip + recomputeStats

**Archivo**: `DungeonRoom.ts`
**Fix**: Envolver `equipItem` + `recomputeStats` en try-catch para evitar estado inconsistente si recompute falla.

---

## Mejoras de Robustez (Client)

### 10. Timeout cleanup en `ActionSlot.handleClick`

**Archivo**: `ActionSlot.tsx` (~línea 228)
**Fix**: Usar ref para el timeoutId y limpiarlo en useEffect cleanup para evitar setState en componente desmontado.

### 11. Fallback si item def nunca carga

**Archivo**: `ItemActionSlot.tsx` (~línea 71)
**Fix**: Añadir timeout de ~5s que muestre estado de error en vez de loading infinito.

### 12. Unsafe spread de `i18nParams` undefined

**Archivo**: `ChatPanel.tsx` (~línea 306)
**Fix**: `{ ...(msg.i18nParams ?? {}), defaultValue: msg.text }`

### 13. Type guard en `e.target as Node`

**Archivo**: `HudRoot.tsx` (~línea 311)
**Fix**: `e.target instanceof Node` en lugar de cast directo.

---

## Limpieza / Calidad

### 14. Eliminar secciones "Misc" huérfanas en protocol.ts

4 headers `// ── Misc ──` sin contenido entre secciones reales.

### 15. `useMemo` para `allStats` en EquipmentTooltip

**Archivo**: `EquipmentTooltip.tsx` (~línea 72)
Crear Set en cada render es innecesario.

### 16. Documentar exclusiones intencionales en `toItemDefClient()`

**Archivo**: `Items.ts`
Comentar por qué `effectType`, `maxStack`, `cooldown`, `bonusPool` no se envían al client.

---

## Mejoras Futuras (No urgentes)

- **FK constraint** en migration: `item_instances.item_id → world.items.id`
- **Pre-inicializar equipment slots** vacíos en PlayerSecretState
- **Cachear stats de equipment** en vez de recalcular en cada recomputeStats
- **Logging en conflictos** de insert de instancias (onConflictDoNothing)
- **Validación post-load** de integridad de instancias al cargar personaje
