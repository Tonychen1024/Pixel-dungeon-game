"""Procedural pixel-art drawing helpers."""
import pygame
from .constants import (
    TILE_SIZE, C_FLOOR, C_FLOOR_ALT, C_WALL, C_WALL_EDGE,
    C_DEST_TILE, C_DEST_GROUT, C_DARK_BG,
)

# ── Tile surfaces (cached) ───────────────────────────────────────────────────

_tile_cache: dict = {}


def _make_floor_tile(alt: bool = False) -> pygame.Surface:
    surf = pygame.Surface((TILE_SIZE, TILE_SIZE))
    base = C_FLOOR_ALT if alt else C_FLOOR
    surf.fill(base)
    # subtle grid lines
    darker = tuple(max(0, c - 10) for c in base)
    pygame.draw.line(surf, darker, (0, 0), (TILE_SIZE - 1, 0))
    pygame.draw.line(surf, darker, (0, 0), (0, TILE_SIZE - 1))
    return surf


def _make_wall_tile() -> pygame.Surface:
    surf = pygame.Surface((TILE_SIZE, TILE_SIZE))
    surf.fill(C_WALL)
    # brick pattern
    pygame.draw.rect(surf, C_WALL_EDGE, (1, 1, 14, 13))
    pygame.draw.rect(surf, C_WALL_EDGE, (17, 1, 14, 13))
    pygame.draw.rect(surf, C_WALL_EDGE, (9, 17, 14, 13))
    # top/left highlights
    pygame.draw.line(surf, (60, 50, 50), (0, 0), (TILE_SIZE - 1, 0))
    pygame.draw.line(surf, (60, 50, 50), (0, 0), (0, TILE_SIZE - 1))
    return surf


def _make_dest_tile() -> pygame.Surface:
    """Old-street brick look – lighter warm tones."""
    surf = pygame.Surface((TILE_SIZE, TILE_SIZE))
    surf.fill(C_DEST_GROUT)
    # Two brick rows
    for row, y in enumerate([2, 18]):
        offset = 0 if row % 2 == 0 else TILE_SIZE // 2
        for col in range(-1, 2):
            bx = col * (TILE_SIZE // 2) + offset
            pygame.draw.rect(surf, C_DEST_TILE, (bx + 1, y, (TILE_SIZE // 2) - 2, 12))
    return surf


def get_tile_surface(tile_type: int, alt: bool = False) -> pygame.Surface:
    key = (tile_type, alt)
    if key not in _tile_cache:
        from .constants import TILE_FLOOR, TILE_WALL, TILE_DEST
        if tile_type == TILE_FLOOR:
            _tile_cache[key] = _make_floor_tile(alt)
        elif tile_type == TILE_WALL:
            _tile_cache[key] = _make_wall_tile()
        elif tile_type == TILE_DEST:
            _tile_cache[key] = _make_dest_tile()
        else:
            _tile_cache[key] = _make_floor_tile(alt)
    return _tile_cache[key]


# ── Player sprite ────────────────────────────────────────────────────────────

def draw_player(surface: pygame.Surface, x: float, y: float, shield_active: bool) -> None:
    """Top-down head of the player character."""
    ix, iy = int(x), int(y)
    radius = 14

    if shield_active:
        # yellow shield glow
        shield_surf = pygame.Surface((radius * 4 + 10, radius * 4 + 10), pygame.SRCALPHA)
        pygame.draw.circle(shield_surf, (240, 220, 50, 80), (radius * 2 + 5, radius * 2 + 5), radius * 2 + 4)
        pygame.draw.circle(shield_surf, (240, 220, 50, 160), (radius * 2 + 5, radius * 2 + 5), radius * 2, 2)
        surface.blit(shield_surf, (ix - radius * 2 - 5, iy - radius * 2 - 5))

    # Head
    pygame.draw.circle(surface, (200, 160, 110), (ix, iy), radius)
    # Hair
    pygame.draw.arc(surface, (80, 50, 20),
                    pygame.Rect(ix - radius, iy - radius, radius * 2, radius * 2),
                    0, 3.14159, radius // 2)
    # Eyes
    pygame.draw.circle(surface, (40, 40, 60), (ix - 5, iy - 3), 3)
    pygame.draw.circle(surface, (40, 40, 60), (ix + 5, iy - 3), 3)
    # Eye shine
    pygame.draw.circle(surface, (200, 220, 255), (ix - 4, iy - 4), 1)
    pygame.draw.circle(surface, (200, 220, 255), (ix + 6, iy - 4), 1)
    # Outline
    pygame.draw.circle(surface, (50, 30, 10), (ix, iy), radius, 1)


# ── Monster sprite ───────────────────────────────────────────────────────────

def draw_monster(surface: pygame.Surface, x: float, y: float, hp_frac: float) -> None:
    """Top-down horror head of a monster."""
    ix, iy = int(x), int(y)
    r = 16

    # Body (dark green-grey)
    pygame.draw.circle(surface, (40, 55, 35), (ix, iy), r)
    # Bumpy skin highlights
    for dx, dy, cr in [(-6, -6, 3), (6, -5, 2), (0, -8, 2), (-8, 2, 2)]:
        pygame.draw.circle(surface, (55, 75, 45), (ix + dx, iy + dy), cr)

    # Red glowing eyes
    pygame.draw.circle(surface, (220, 30, 30), (ix - 5, iy - 4), 4)
    pygame.draw.circle(surface, (220, 30, 30), (ix + 5, iy - 4), 4)
    pygame.draw.circle(surface, (255, 80, 80), (ix - 5, iy - 4), 2)
    pygame.draw.circle(surface, (255, 80, 80), (ix + 5, iy - 4), 2)

    # Jagged mouth
    mouth_y = iy + 5
    for i, mx in enumerate(range(ix - 7, ix + 8, 2)):
        my = mouth_y + (2 if i % 2 == 0 else -2)
        pygame.draw.circle(surface, (180, 10, 10), (mx, my), 1)

    # Outline
    pygame.draw.circle(surface, (20, 30, 15), (ix, iy), r, 2)


# ── Projectile / effect helpers ──────────────────────────────────────────────

def draw_bullet(surface: pygame.Surface, x: float, y: float, color=(255, 220, 50)) -> None:
    ix, iy = int(x), int(y)
    pygame.draw.circle(surface, color, (ix, iy), 5)
    pygame.draw.circle(surface, (255, 255, 200), (ix, iy), 2)


def draw_melee_hit(surface: pygame.Surface, x: float, y: float,
                   angle: float, radius: int, alpha_frac: float) -> None:
    """Semi-transparent arc flash."""
    import math
    n = 12
    alpha = int(200 * alpha_frac)
    for i in range(n):
        a = angle - 0.6 + (1.2 / n) * i
        ex = x + math.cos(a) * radius
        ey = y + math.sin(a) * radius
        c = (240, 200, 50, alpha)
        s = pygame.Surface((10, 10), pygame.SRCALPHA)
        pygame.draw.circle(s, c, (5, 5), 5)
        surface.blit(s, (int(ex) - 5, int(ey) - 5))
