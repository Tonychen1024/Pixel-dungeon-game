"""Fixed tile map for Level 1.

Map is MAP_COLS×MAP_ROWS tiles (75×56 at 32px each = 2400×1792 px).
The destination tile cluster is placed at a random map edge, with
indestructible walls directly in front (between map interior and dest).
"""
import random
import pygame
from .constants import (
    TILE_FLOOR, TILE_WALL, TILE_DEST,
    MAP_COLS, MAP_ROWS, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
)

# Destination area size (tiles)
DEST_W = 4
DEST_H = 4

# Fixed obstacle rectangles (col, row, w, h) — hand-designed
_OBSTACLE_RECTS = [
    # ── top-left cluster
    (5,  4,  5, 3),
    (12, 2,  3, 5),
    # ── top-right cluster
    (60, 3,  6, 3),
    (68, 5,  4, 4),
    # ── middle corridor dividers
    (20, 18, 3, 8),
    (30, 22, 8, 3),
    (48, 16, 3, 9),
    # ── bottom clusters
    (8,  42, 7, 3),
    (22, 46, 4, 6),
    (55, 40, 6, 3),
    (63, 48, 5, 4),
    # ── center room
    (32, 26, 12, 2),
    (32, 28,  2, 6),
    (42, 28,  2, 6),
    (32, 34, 12, 2),
    # ── scattered singles
    (15, 10, 2, 2),
    (50, 10, 2, 2),
    (38, 10, 2, 3),
    (10, 30, 3, 2),
    (62, 30, 3, 2),
    (38, 48, 4, 2),
]


def build_map(seed: int = 42) -> tuple[list[list[int]], pygame.Rect, list[pygame.Rect]]:
    """Return (tile_grid, dest_world_rect, wall_world_rects_list).

    tile_grid[row][col] = TILE_FLOOR | TILE_WALL | TILE_DEST
    dest_world_rect: pygame.Rect of the destination zone in world coords.
    """
    rng = random.Random(seed)

    grid = [[TILE_FLOOR] * MAP_COLS for _ in range(MAP_ROWS)]

    # Border walls (1 tile thick)
    for c in range(MAP_COLS):
        grid[0][c] = TILE_WALL
        grid[MAP_ROWS - 1][c] = TILE_WALL
    for r in range(MAP_ROWS):
        grid[r][0] = TILE_WALL
        grid[r][MAP_COLS - 1] = TILE_WALL

    # Interior obstacles
    for (oc, or_, ow, oh) in _OBSTACLE_RECTS:
        for dr in range(oh):
            for dc in range(ow):
                r2, c2 = or_ + dr, oc + dc
                if 0 < r2 < MAP_ROWS - 1 and 0 < c2 < MAP_COLS - 1:
                    grid[r2][c2] = TILE_WALL

    # Destination placement: random edge side
    side = rng.choice(['top', 'bottom', 'left', 'right'])
    if side == 'top':
        dc = rng.randint(10, MAP_COLS - DEST_W - 10)
        dr = 1
        # wall guard row just below destination
        wall_row = dr + DEST_H
        wall_col_start, wall_col_end = dc - 1, dc + DEST_W + 1
        for c in range(wall_col_start, wall_col_end):
            if 0 < wall_row < MAP_ROWS - 1:
                grid[wall_row][c] = TILE_WALL
    elif side == 'bottom':
        dc = rng.randint(10, MAP_COLS - DEST_W - 10)
        dr = MAP_ROWS - 1 - DEST_H
        wall_row = dr - 1
        wall_col_start, wall_col_end = dc - 1, dc + DEST_W + 1
        for c in range(wall_col_start, wall_col_end):
            if 0 < wall_row < MAP_ROWS - 1:
                grid[wall_row][c] = TILE_WALL
    elif side == 'left':
        dc = 1
        dr = rng.randint(10, MAP_ROWS - DEST_H - 10)
        wall_col = dc + DEST_W
        wall_row_start, wall_row_end = dr - 1, dr + DEST_H + 1
        for r in range(wall_row_start, wall_row_end):
            if 0 < wall_col < MAP_COLS - 1:
                grid[r][wall_col] = TILE_WALL
    else:  # right
        dc = MAP_COLS - 1 - DEST_W
        dr = rng.randint(10, MAP_ROWS - DEST_H - 10)
        wall_col = dc - 1
        wall_row_start, wall_row_end = dr - 1, dr + DEST_H + 1
        for r in range(wall_row_start, wall_row_end):
            if 0 < wall_col < MAP_COLS - 1:
                grid[r][wall_col] = TILE_WALL

    # Place destination tiles
    for dr2 in range(DEST_H):
        for dc2 in range(DEST_W):
            r2, c2 = dr + dr2, dc + dc2
            if 0 <= r2 < MAP_ROWS and 0 <= c2 < MAP_COLS:
                grid[r2][c2] = TILE_DEST

    dest_rect = pygame.Rect(dc * TILE_SIZE, dr * TILE_SIZE, DEST_W * TILE_SIZE, DEST_H * TILE_SIZE)

    # Collect all wall rects for collision
    wall_rects = _collect_wall_rects(grid)

    return grid, dest_rect, wall_rects


def _collect_wall_rects(grid: list[list[int]]) -> list:
    rects = []
    for r in range(MAP_ROWS):
        for c in range(MAP_COLS):
            if grid[r][c] == TILE_WALL:
                rects.append(pygame.Rect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE))
    return rects


def get_player_start(grid: list[list[int]]) -> tuple[float, float]:
    """Return a safe starting position (world coords) roughly at map center."""
    cx = MAP_COLS // 2
    cy = MAP_ROWS // 2
    # Search outward for a floor tile
    for radius in range(0, 10):
        for dc in range(-radius, radius + 1):
            for dr in range(-radius, radius + 1):
                r, c = cy + dr, cx + dc
                if 0 <= r < MAP_ROWS and 0 <= c < MAP_COLS:
                    if grid[r][c] == TILE_FLOOR:
                        return (c + 0.5) * TILE_SIZE, (r + 0.5) * TILE_SIZE
    return MAP_WIDTH / 2, MAP_HEIGHT / 2
