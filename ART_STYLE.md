# Art Style Guide

## Visual Style

- **Genre**: Multiplayer dungeon crawler (isometric 3D)
- **Art direction**: Chibi / cartoon low-poly
- **Camera**: Fixed isometric angle (ArcRotateCamera)
- **Lighting**: Dark dungeon atmosphere with torch-based lighting, fog of war shader
- **Color palette**: Dark grays/slates for environment, teal/cyan accents for UI, warm orange for interactables

## Character Models

- **Style**: Chibi proportions (large head, small body), low-poly
- **Source**: Meshy AI (Text-to-3D → Animate)
- **Format**: GLB, multi-file (base idle.glb + separate per-animation GLBs)
- **Animations**: idle, walk, run, punch, heavy_punch, death
- **Export settings**: Separate files per animation (withSkin), not single-file (avoids skeleton inconsistencies)
- **Material fix**: PBR opaque, emissiveIntensity capped at 0.4 (Meshy bakes lighting into emissive)

## Environment

- **Dungeons**: Procedural BSP generation, stone floors, gray walls
- **Tiles**: Primitives with texture variations (floor variants, wall variants)
- **Gates**: Orange/warm colored, visually distinct from walls
- **Fog of war**: Depth-based PostProcess shader darkening edges

## Props & Objects

- **Loot bags**: Treasure chest (replacing placeholder golden sphere)
- **Style**: Same chibi/cartoon low-poly as characters
- **Source**: Meshy AI (Text-to-3D, Low poly, No pose)
- **Animation**: Code-driven (bobbing, rotation) — no skeleton needed

## Meshy Workflow

### Characters (biped)

1. Text-to-3D: describe character in chibi fantasy style
2. Generate texture (cartoon style)
3. Animate: select animations (idle=Breathe, walk, run, attack, death)
4. Export: separate files per animation (withSkin), GLB format
5. Copy to `packages/client/public/models/characters/<name>/`
6. Register in `CharacterLoaderRegistry.ts` with animMap + animFiles

### Props (static objects)

1. Text-to-3D: describe object with "chibi fantasy, low poly, game asset, isometric"
2. Generate texture
3. Export: single GLB
4. Copy to `packages/client/public/models/props/`

## HUD & UI

- **Framework**: React + Tailwind CSS overlay (not Babylon.js GUI)
- **Theme**: Dark semi-transparent panels, rounded corners
- **Accent colors**: Teal/cyan (health), yellow/gold (names, levels, XP), orange (notifications)
- **In-world UI**: Babylon.js GUI only (floating health bars, name labels, chat bubbles)
- **Inspiration**: WoW-style (XP bar, skill bar, character panel, chat)
