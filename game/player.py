"""Player entity."""
from __future__ import annotations
import pygame
from .constants import (
    PLAYER_HP, PLAYER_SPEED, PLAYER_RADIUS,
    SKILL_SHIELD_REDUCTION, MAP_WIDTH, MAP_HEIGHT,
)
from .assets import draw_player


class Player:
    def __init__(self, x: float, y: float, skills: list):
        self.x = float(x)
        self.y = float(y)
        self.hp = PLAYER_HP
        self.max_hp = PLAYER_HP
        self.skills = skills          # list[Skill] in current order
        self.skill_index = 0          # active skill slot
        self.shield_timer = 0.0       # seconds of shield remaining
        self.pending_melee = None     # set by MeleeSkill, consumed by level

        # Invincibility flash timer (after taking damage)
        self._hit_flash = 0.0

    @property
    def alive(self) -> bool:
        return self.hp > 0

    @property
    def shield_active(self) -> bool:
        return self.shield_timer > 0

    @property
    def current_skill(self):
        return self.skills[self.skill_index]

    def cycle_skill(self) -> None:
        self.skill_index = (self.skill_index + 1) % len(self.skills)

    def take_damage(self, amount: int) -> None:
        if self.shield_active:
            amount = int(amount * (1.0 - SKILL_SHIELD_REDUCTION))
        self.hp = max(0, self.hp - amount)
        self._hit_flash = 0.15

    def update(self, dt: float, keys, wall_rects: list) -> None:
        # Shield timer
        if self.shield_timer > 0:
            self.shield_timer = max(0.0, self.shield_timer - dt)

        # Skill cooldowns
        for skill in self.skills:
            skill.update(dt)

        # Hit flash
        if self._hit_flash > 0:
            self._hit_flash = max(0.0, self._hit_flash - dt)

        # Movement
        vx, vy = 0.0, 0.0
        if keys[pygame.K_w] or keys[pygame.K_UP]:
            vy -= 1
        if keys[pygame.K_s] or keys[pygame.K_DOWN]:
            vy += 1
        if keys[pygame.K_a] or keys[pygame.K_LEFT]:
            vx -= 1
        if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            vx += 1

        # Normalize diagonal
        if vx != 0 and vy != 0:
            import math
            length = math.sqrt(vx * vx + vy * vy)
            vx /= length
            vy /= length

        new_x = self.x + vx * PLAYER_SPEED * dt
        new_y = self.y + vy * PLAYER_SPEED * dt

        # Wall collision (axis-separated)
        r = PLAYER_RADIUS
        # Try X
        test_rect = pygame.Rect(int(new_x) - r, int(self.y) - r, r * 2, r * 2)
        if not any(test_rect.colliderect(wr) for wr in wall_rects):
            self.x = new_x
        # Try Y
        test_rect = pygame.Rect(int(self.x) - r, int(new_y) - r, r * 2, r * 2)
        if not any(test_rect.colliderect(wr) for wr in wall_rects):
            self.y = new_y

        # Map boundary
        self.x = max(r, min(MAP_WIDTH - r, self.x))
        self.y = max(r, min(MAP_HEIGHT - r, self.y))

    def draw(self, surface: pygame.Surface, cam) -> None:
        sx, sy = cam.world_to_screen(self.x, self.y)
        # Flash white on hit
        if self._hit_flash > 0 and int(self._hit_flash * 20) % 2 == 0:
            pygame.draw.circle(surface, (255, 255, 255), (int(sx), int(sy)), PLAYER_RADIUS + 2)
        draw_player(surface, sx, sy, self.shield_active)

    def get_rect(self) -> pygame.Rect:
        r = PLAYER_RADIUS
        return pygame.Rect(int(self.x) - r, int(self.y) - r, r * 2, r * 2)
