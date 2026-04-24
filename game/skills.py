"""Skills: Ranged, Melee, Shield – plus projectile entities."""
from __future__ import annotations
import math
import pygame
from .constants import (
    SKILL_RANGED_DMG, SKILL_RANGED_CD, SKILL_RANGED_SPEED, SKILL_RANGED_RANGE,
    SKILL_MELEE_DMG, SKILL_MELEE_CD, SKILL_MELEE_RADIUS,
    SKILL_SHIELD_CD, SKILL_SHIELD_DURATION, SKILL_SHIELD_REDUCTION,
    C_YELLOW, C_ORANGE, C_BLUE,
)
from . import sounds


# ── Projectile ────────────────────────────────────────────────────────────────

class Projectile:
    """A bullet/projectile flying in a direction."""

    def __init__(self, x: float, y: float, dx: float, dy: float,
                 speed: float, damage: int, max_range: float,
                 owner: str = 'player', color=(255, 220, 50)):
        self.x = x
        self.y = y
        self.dx = dx
        self.dy = dy
        self.speed = speed
        self.damage = damage
        self.max_range = max_range
        self.owner = owner
        self.color = color
        self.traveled = 0.0
        self.alive = True

    def update(self, dt: float) -> None:
        dist = self.speed * dt
        self.x += self.dx * dist
        self.y += self.dy * dist
        self.traveled += dist
        if self.traveled >= self.max_range:
            self.alive = False

    def draw(self, surface: pygame.Surface, cam) -> None:
        from .assets import draw_bullet
        sx, sy = cam.world_to_screen(self.x, self.y)
        draw_bullet(surface, sx, sy, self.color)

    def get_rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x) - 5, int(self.y) - 5, 10, 10)


# ── Melee hit flash ───────────────────────────────────────────────────────────

class MeleeHitEffect:
    DURATION = 0.25

    def __init__(self, x: float, y: float, angle: float):
        self.x = x
        self.y = y
        self.angle = angle
        self.timer = self.DURATION
        self.alive = True

    def update(self, dt: float) -> None:
        self.timer -= dt
        if self.timer <= 0:
            self.alive = False

    def draw(self, surface: pygame.Surface, cam) -> None:
        from .assets import draw_melee_hit
        sx, sy = cam.world_to_screen(self.x, self.y)
        draw_melee_hit(surface, sx, sy, self.angle, SKILL_MELEE_RADIUS, self.timer / self.DURATION)


# ── Base Skill ────────────────────────────────────────────────────────────────

class Skill:
    name: str = ''
    icon_color: tuple = C_ORANGE
    cooldown: float = 2.0

    def __init__(self):
        self._cd_timer = 0.0  # time until ready (0 = ready)

    @property
    def ready(self) -> bool:
        return self._cd_timer <= 0

    @property
    def cd_fraction(self) -> float:
        """0.0 = ready, 1.0 = just used."""
        return self._cd_timer / self.cooldown if self._cd_timer > 0 else 0.0

    def update(self, dt: float) -> None:
        if self._cd_timer > 0:
            self._cd_timer = max(0.0, self._cd_timer - dt)

    def activate(self, player, world_mx: float, world_my: float,
                 projectiles: list, effects: list) -> None:
        """Override in subclasses."""
        pass


# ── Skill 1: Ranged ───────────────────────────────────────────────────────────

class RangedSkill(Skill):
    name = 'Ranged'
    icon_color = (80, 160, 255)
    cooldown = SKILL_RANGED_CD

    def activate(self, player, world_mx: float, world_my: float,
                 projectiles: list, effects: list) -> None:
        if not self.ready:
            return
        dx = world_mx - player.x
        dy = world_my - player.y
        length = math.hypot(dx, dy)
        if length == 0:
            dx, dy = 1.0, 0.0
        else:
            dx /= length
            dy /= length
        projectiles.append(Projectile(
            player.x, player.y, dx, dy,
            SKILL_RANGED_SPEED, SKILL_RANGED_DMG, SKILL_RANGED_RANGE,
            owner='player', color=(100, 200, 255),
        ))
        self._cd_timer = self.cooldown
        sounds.play('ranged')


# ── Skill 2: Melee ────────────────────────────────────────────────────────────

class MeleeSkill(Skill):
    name = 'Melee'
    icon_color = C_ORANGE
    cooldown = SKILL_MELEE_CD

    def activate(self, player, world_mx: float, world_my: float,
                 projectiles: list, effects: list) -> None:
        if not self.ready:
            return
        dx = world_mx - player.x
        dy = world_my - player.y
        angle = math.atan2(dy, dx)
        effects.append(MeleeHitEffect(player.x, player.y, angle))
        # Store pending melee so level can handle damage
        player.pending_melee = (player.x, player.y, angle, SKILL_MELEE_DMG, SKILL_MELEE_RADIUS)
        self._cd_timer = self.cooldown
        sounds.play('melee')


# ── Skill 3: Shield ───────────────────────────────────────────────────────────

class ShieldSkill(Skill):
    name = 'Shield'
    icon_color = C_YELLOW
    cooldown = SKILL_SHIELD_CD

    def activate(self, player, world_mx: float, world_my: float,
                 projectiles: list, effects: list) -> None:
        if not self.ready:
            return
        player.shield_timer = SKILL_SHIELD_DURATION
        self._cd_timer = self.cooldown
        sounds.play('shield')


# ── Skill factory ─────────────────────────────────────────────────────────────

SKILL_CLASSES = [RangedSkill, MeleeSkill, ShieldSkill]


def make_skills(order: list[int]) -> list[Skill]:
    """Return skill list in the given order (indices 0,1,2 → classes)."""
    return [SKILL_CLASSES[i]() for i in order]
