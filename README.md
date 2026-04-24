# Pixel-dungeon-game

A pixel-art top-down dungeon game built with Python + Pygame.

## Requirements

```
pip install -r requirements.txt
```

## How to Run

```
python main.py
```

## Game Overview

### Lobby
- **Start Game** → Skill Order screen → Level 1
- **How to Play** → English instruction page

### Controls
| Key / Button | Action |
|---|---|
| W A S D | Move |
| Right-Click | Cycle skill (1→2→3→1…) |
| Left-Click | Activate current skill |

### Skills
| # | Name | Effect | Damage | Cooldown |
|---|---|---|---|---|
| 1 | Ranged Attack | Fire projectile toward cursor | 1000 | 2 s |
| 2 | Melee Attack | Slash nearby enemies | 2000 | 2 s |
| 3 | Shield | 50% damage reduction for 3 s | — | 5 s |

### Level 1
- Player HP: **10 000**
- Monsters: up to **5** on-screen (HP 5000 each), respawn after 5 s
- Monster attacks: collision **3000 dmg** (CD 3 s) / ranged **500 dmg** (CD 3 s)
- **Goal**: reach the glowing destination tile at the map edge — no need to clear monsters!

### Map
- Fixed pixel-art map, **3× the screen size** (camera follows player)
- Indestructible walls + obstacles
- Minimap in bottom-left corner
- Arrow indicator points to destination when off-screen
