# Art Style Guide

## Visual Style

- **Genre**: Multiplayer dungeon crawler (isometric 3D)
- **Art direction**: Chibi / cartoon low-poly
- **Camera**: Fixed isometric angle (ArcRotateCamera), free camera toggle with WASD for debug
- **Lighting**: Dark dungeon atmosphere, hemispheric ambient + player spot torch + portal point light
- **Fog of war**: Depth-based PostProcess shader darkening edges
- **Color palette**: Dark grays/slates for environment, teal/cyan accents for UI, warm orange for interactables, gold for special items

## Character Models

- **Style**: Chibi proportions (large head, small body), low-poly
- **Source**: Meshy AI (Text-to-3D → Animate)
- **Format**: GLB, multi-file (base idle.glb + separate per-animation GLBs)
- **Animations**: idle (Breathe), walk, run, punch, heavy_punch, death
- **Export settings**: Separate files per animation (withSkin), not single-file (avoids skeleton inconsistencies)
- **Material fix**: PBR opaque, emissiveIntensity capped at 0.4 (Meshy bakes lighting into emissive)
- **Current models**:
  - **Warrior** (player): scale 1.0, 6 animations
  - **Zombie** (creature): scale 1.0, 5 animations
  - **Stone Golem** (boss): scale 1.5, 6 animations

## Environment

- **Dungeons**: Procedural BSP generation, stone floors, gray walls
- **Tiles**: Primitives with texture variations (floor variants, wall variants)
- **Wall torches**: Particle-only (no light cost) — lights removed for performance
- **Fog of war**: Depth-based PostProcess shader darkening edges

## Props & Objects

- **Loot bags**: Treasure chest model with emissive self-glow + ground glow disc (no PointLight)
- **Exit portal**: Stone arch with unlit material + cyan particles + point light
- **Style**: Same chibi/cartoon low-poly as characters
- **Source**: Meshy AI (Text-to-3D, Low poly, No pose)
- **Animation**: Code-driven (bobbing, rotation) — no skeleton needed
- **Registry**: `PropRegistry` maps names to GLB paths, preloaded at startup

## Icons

- **Item/skill/talent icons**: PNG images from craftpix.net packs
- **Path**: `/public/textures/icons/{iconId}.png`
- **Component**: `ItemIcon` renders with shimmer loading placeholder
- **Item rarity borders**: common (none), uncommon (green), rare (blue), epic (purple), legendary (gold)

## Meshy Workflow

### Characters (biped)

1. Text-to-3D: describe character in chibi fantasy style, "arms at sides, T-pose, hands not touching body"
2. Generate texture (cartoon style)
3. Animate: select animations (idle=Breathe, walk, run, attack, death)
4. Export: separate files per animation (withSkin), GLB format
5. Copy to `packages/client/public/models/characters/<name>/` (idle.glb, run.glb, walk.glb, punch.glb, death.glb, heavy_punch.glb)
6. Register in `CharacterLoaderRegistry.ts` with animMap + animFiles + scale

### Props (static objects)

1. Text-to-3D: describe object with "chibi fantasy, low poly, game asset, isometric"
2. Generate texture
3. Export: single GLB, enable Resize with Origin=Bottom
4. Copy to `packages/client/public/models/props/`
5. Register in `PropRegistry.ts` with scale

## HUD & UI

- **Framework**: React + Tailwind CSS overlay (not Babylon.js GUI)
- **Theme**: Dark semi-transparent panels (slate-900/95), rounded corners, backdrop blur
- **Accent colors**: Teal/cyan (health), yellow/gold (names, levels, XP, legendary items), orange (notifications)
- **In-world UI**: Babylon.js GUI only (floating health bars, name labels, chat bubbles)
- **Inspiration**: WoW-style (XP bar, skill bar, character panel, chat, talent tree)

## Visual Effects

- **Level-up**: Golden text overlay ("Level Up" + number) with radial glow burst + 3D golden particle aura
- **Heal**: Green particles rising from character
- **Low health**: Red vignette border (intensity scales with HP, disappears at 0)
- **Death**: Freeze animation on last frame, corpse visible 5s
- **Loot glow**: Emissive chest + DynamicTexture ground disc
- **Portal**: Unlit stone arch + cyan ParticleSystem + PointLight

## Branding

- **Name**: KrawlHero
- **Logo**: AI-generated golden metallic text (Ideogram.ai), cropped PNG
- **Login screen**: Fantasy stone archway background + floating golden CSS particles
- **Loading screen**: Logo centered with progress bar
