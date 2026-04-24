"""Monster entity with chase AI, collision damage, and ranged attack."""
from __future__ import annotations
import math
import random
import pygame
from .constants import (
    MONSTER_HP, MONSTER_SPEED, MONSTER_RADIUS,
    MONSTER_MELEE_DMG, MONSTER_MELEE_CD,
    MONSTER_RANGED_DMG, MONSTER_RANGED_CD, MONSTER_RANGED_RANGE,
    MONSTER_BULLET_SPEED, MAP_WIDTH, MAP_HEIGHT,
)
from .assets import draw_monster
from .skills import Projectile


class Monster:
    def __init__(self, x: float, y: float):
        self.x = float(x)
        self.y = float(y)
        self.hp = MONSTER_HP
        self.max_hp = MONSTER_HP
        self.alive = True
        self._melee_cd = 0.0
        self._ranged_cd = random.uniform(0, MONSTER_RANGED_CD)  # stagger initial shots

    def take_damage(self, amount: int) -> None:
        self.hp = max(0, self.hp - amount)
        if self.hp <= 0:
            self.alive = False

    def update(self, dt: float, player, wall_rects: list, projectiles: list) -> None:
        if not self.alive:
            return

        # Cooldown timers
        if self._melee_cd > 0:
            self._melee_cd = max(0.0, self._melee_cd - dt)
        if self._ranged_cd > 0:
            self._ranged_cd = max(0.0, self._ranged_cd - dt)

        # Chase player
        dx = player.x - self.x
        dy = player.y - self.y
        dist = math.hypot(dx, dy)

        if dist > 0:
            ndx, ndy = dx / dist, dy / dist
            new_x = self.x + ndx * MONSTER_SPEED * dt
            new_y = self.y + ndy * MONSTER_SPEED * dt

            r = MONSTER_RADIUS
            # Axis-separated wall collision
            test_x = pygame.Rect(int(new_x) - r, int(self.y) - r, r * 2, r * 2)
            if not any(test_x.colliderect(wr) for wr in wall_rects):
                self.x = new_x
            test_y = pygame.Rect(int(self.x) - r, int(new_y) - r, r * 2, r * 2)
            if not any(test_y.colliderect(wr) for wr in wall_rects):
                self.y = new_y

            # Map bounds
            self.x = max(r, min(MAP_WIDTH - r, self.x))
            self.y = max(r, min(MAP_HEIGHT - r, self.y))

            # Collision damage
            if dist < MONSTER_RADIUS + 14 + 4:  # monster + player radius + gap
                if self._melee_cd <= 0 and player.alive:
                    player.take_damage(MONSTER_MELEE_DMG)
                    self._melee_cd = MONSTER_MELEE_CD
                    from . import sounds
                    sounds.play('hit')

            # Ranged attack when in range but not touching
            if MONSTER_RANGED_RANGE * 0.3 < dist < MONSTER_RANGED_RANGE:
                if self._ranged_cd <= 0 and player.alive:
                    self._fire(player, projectiles)
                    self._ranged_cd = MONSTER_RANGED_CD

    def _fire(self, player, projectiles: list) -> None:
        dx = player.x - self.x
        dy = player.y - self.y
        dist = math.hypot(dx, dy)
        if dist == 0:
            return
        projectiles.append(Projectile(
            self.x, self.y, dx / dist, dy / dist,
            MONSTER_BULLET_SPEED, MONSTER_RANGED_DMG, MONSTER_RANGED_RANGE,
            owner='monster', color=(220, 50, 50),
        ))

    def draw(self, surface: pygame.Surface, cam) -> None:
        sx, sy = cam.world_to_screen(self.x, self.y)
        draw_monster(surface, sx, sy, self.hp / self.max_hp)
        # HP bar
        bar_w = 36
        bar_h = 5
        bx = int(sx) - bar_w // 2
        by = int(sy) - MONSTER_RADIUS - 10
        pygame.draw.rect(surface, (60, 20, 20), (bx, by, bar_w, bar_h))
        fill = int(bar_w * max(0, self.hp / self.max_hp))
        pygame.draw.rect(surface, (200, 50, 50), (bx, by, fill, bar_h))
        pygame.draw.rect(surface, (100, 40, 40), (bx, by, bar_w, bar_h), 1)

    def get_rect(self) -> pygame.Rect:
        r = MONSTER_RADIUS
        return pygame.Rect(int(self.x) - r, int(self.y) - r, r * 2, r * 2)


# ── Spawner ───────────────────────────────────────────────────────────────────

class MonsterSpawner:
    """Maintains up to MAX monsters; respawns 5 s after death."""

    MAX = 5
    RESPAWN = 5.0

    def __init__(self, grid, wall_rects: list, player_start: tuple[float, float]):
        self._grid = grid
        self._wall_rects = wall_rects
        self._player_start = player_start
        self.monsters: list[Monster] = []
        self._respawn_queue: list[float] = []  # timestamps until spawn

        # Initial spawn
        for _ in range(self.MAX):
            self._try_spawn()

    def _spawn_point(self) -> tuple[float, float]:
        from .constants import MAP_COLS, MAP_ROWS, TILE_FLOOR, TILE_SIZE
        px, py = self._player_start
        for _ in range(200):
            c = random.randint(1, MAP_COLS - 2)
            r = random.randint(1, MAP_ROWS - 2)
            if self._grid[r][c] == TILE_FLOOR:
                wx = (c + 0.5) * TILE_SIZE
                wy = (r + 0.5) * TILE_SIZE
                # Ensure not too close to player
                if math.hypot(wx - px, wy - py) > 200:
                    return wx, wy
        return px + 300, py + 300

    def _try_spawn(self) -> None:
        x, y = self._spawn_point()
        self.monsters.append(Monster(x, y))

    def update(self, dt: float, player, projectiles: list) -> None:
        # Update alive monsters
        for m in self.monsters:
            m.update(dt, player, self._wall_rects, projectiles)

        # Collect dead
        dead_count = sum(1 for m in self.monsters if not m.alive)
        self.monsters = [m for m in self.monsters if m.alive]

        # Queue respawns
        for _ in range(dead_count):
            self._respawn_queue.append(self.RESPAWN)

        # Tick respawn timers
        new_queue = []
        for t in self._respawn_queue:
            t -= dt
            if t <= 0 and len(self.monsters) < self.MAX:
                self._try_spawn()
            else:
                new_queue.append(t)
        self._respawn_queue = new_queue

    def draw(self, surface: pygame.Surface, cam) -> None:
        for m in self.monsters:
            m.draw(surface, cam)
