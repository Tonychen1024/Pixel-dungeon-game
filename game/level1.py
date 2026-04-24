"""Level 1 – main gameplay scene."""
from __future__ import annotations
import math
import pygame
from .states import GameState
from .constants import (
    SCREEN_WIDTH, SCREEN_HEIGHT,
    MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS,
    TILE_FLOOR, TILE_WALL, TILE_DEST,
    C_DARK_BG, C_WHITE, C_RED, C_YELLOW, C_GREEN, C_LIGHT_GRAY,
    SKILL_MELEE_RADIUS,
)
from .map_data import build_map, get_player_start
from .camera import Camera
from .player import Player
from .monster import MonsterSpawner
from .skills import make_skills
from .assets import get_tile_surface
from .ui import draw_hud
from . import sounds


class Level1:
    def __init__(self, screen: pygame.Surface, skill_order: list[int]):
        self.screen = screen

        # Build map
        self.grid, self.dest_rect, self.wall_rects = build_map()

        # Player
        px, py = get_player_start(self.grid)
        skills = make_skills(skill_order)
        self.player = Player(px, py, skills)

        # Monster spawner
        self.spawner = MonsterSpawner(self.grid, self.wall_rects, (px, py))

        # Projectiles (shared – player & monster)
        self.projectiles: list = []

        # Melee hit effects
        self.effects: list = []

        # Camera
        self.camera = Camera()
        self.camera.update(self.player.get_rect())

        # Pre-render tile surfaces
        self._tile_surf: dict = {}
        self._prerender_tiles()

        # Fonts
        self._big_font   = pygame.font.SysFont('Arial', 48, bold=True)
        self._small_font = pygame.font.SysFont('Arial', 18)

        # Death overlay timer
        self._dead_timer = 0.0

    # ── Pre-render ────────────────────────────────────────────────────────────

    def _prerender_tiles(self) -> None:
        for tile_type in (TILE_FLOOR, TILE_WALL, TILE_DEST):
            self._tile_surf[(tile_type, False)] = get_tile_surface(tile_type, False)
            self._tile_surf[(tile_type, True)]  = get_tile_surface(tile_type, True)

    # ── Update ────────────────────────────────────────────────────────────────

    def update(self, dt: float, events: list) -> tuple | None:
        if not self.player.alive:
            self._dead_timer += dt
            for event in events:
                if (event.type == pygame.KEYDOWN and
                        event.key in (pygame.K_RETURN, pygame.K_SPACE)):
                    return (GameState.LOBBY, {})
            if self._dead_timer > 4.0:
                return (GameState.LOBBY, {})
            return None

        keys = pygame.key.get_pressed()

        # Handle events
        for event in events:
            if event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 3:  # right-click → cycle skill
                    self.player.cycle_skill()
                elif event.button == 1:  # left-click → use skill
                    mx, my = pygame.mouse.get_pos()
                    wx, wy = self.camera.screen_to_world(mx, my)
                    self.player.current_skill.activate(
                        self.player, wx, wy, self.projectiles, self.effects
                    )

        # Player movement
        self.player.update(dt, keys, self.wall_rects)

        # Clear pending melee
        if self.player.pending_melee is not None:
            self._apply_melee(*self.player.pending_melee)
            self.player.pending_melee = None

        # Monster update (passes projectiles list for monster bullets)
        self.spawner.update(dt, self.player, self.projectiles)

        # Projectiles
        self._update_projectiles(dt)

        # Effects
        for ef in self.effects:
            ef.update(dt)
        self.effects = [ef for ef in self.effects if ef.alive]

        # Camera
        self.camera.update(self.player.get_rect())

        # Win condition – player center inside dest rect
        if self.dest_rect.collidepoint(int(self.player.x), int(self.player.y)):
            return (GameState.WIN, {})

        return None

    def _apply_melee(self, cx: float, cy: float, angle: float,
                     damage: int, radius: int) -> None:
        for m in self.spawner.monsters:
            dist = math.hypot(m.x - cx, m.y - cy)
            if dist <= radius + 10:
                # Check within ±60° arc
                ma = math.atan2(m.y - cy, m.x - cx)
                diff = abs((ma - angle + math.pi) % (2 * math.pi) - math.pi)
                if diff < math.pi * 0.4:
                    m.take_damage(damage)

    def _update_projectiles(self, dt: float) -> None:
        for proj in self.projectiles:
            proj.update(dt)
            if not proj.alive:
                continue
            pr = proj.get_rect()
            # Wall collision
            if any(pr.colliderect(wr) for wr in self.wall_rects):
                proj.alive = False
                continue
            # Player bullet → hit monsters
            if proj.owner == 'player':
                for m in self.spawner.monsters:
                    if pr.colliderect(m.get_rect()):
                        m.take_damage(proj.damage)
                        proj.alive = False
                        break
            # Monster bullet → hit player
            elif proj.owner == 'monster':
                if pr.colliderect(self.player.get_rect()):
                    self.player.take_damage(proj.damage)
                    proj.alive = False
                    sounds.play('hit')

        self.projectiles = [p for p in self.projectiles if p.alive]

    # ── Draw ──────────────────────────────────────────────────────────────────

    def draw(self) -> None:
        self.screen.fill(C_DARK_BG)
        self._draw_map()
        self._draw_dest_glow()
        self.spawner.draw(self.screen, self.camera)
        self.player.draw(self.screen, self.camera)
        for proj in self.projectiles:
            proj.draw(self.screen, self.camera)
        for ef in self.effects:
            ef.draw(self.screen, self.camera)
        draw_hud(self.screen, self.player)
        self._draw_minimap()

        if not self.player.alive:
            self._draw_death_screen()

    def _draw_map(self) -> None:
        cam = self.camera
        # Compute visible tile range
        col_start = max(0, cam.offset_x // TILE_SIZE)
        col_end   = min(MAP_COLS, (cam.offset_x + SCREEN_WIDTH)  // TILE_SIZE + 2)
        row_start = max(0, cam.offset_y // TILE_SIZE)
        row_end   = min(MAP_ROWS, (cam.offset_y + SCREEN_HEIGHT) // TILE_SIZE + 2)

        for row in range(row_start, row_end):
            for col in range(col_start, col_end):
                tile = self.grid[row][col]
                alt  = (row + col) % 2 == 1
                surf = self._tile_surf.get((tile, alt)) or self._tile_surf.get((tile, False))
                sx = col * TILE_SIZE - cam.offset_x
                sy = row * TILE_SIZE - cam.offset_y
                self.screen.blit(surf, (sx, sy))

    def _draw_dest_glow(self) -> None:
        """Pulsing golden glow over the destination."""
        import time
        sx, sy = self.camera.world_to_screen(self.dest_rect.x, self.dest_rect.y)
        pulse = abs(math.sin(pygame.time.get_ticks() / 600))
        glow = pygame.Surface((self.dest_rect.w + 20, self.dest_rect.h + 20), pygame.SRCALPHA)
        alpha = int(40 + 40 * pulse)
        pygame.draw.rect(glow, (240, 200, 60, alpha), glow.get_rect(), border_radius=6)
        self.screen.blit(glow, (int(sx) - 10, int(sy) - 10))

        # Arrow indicator pointing to destination
        self._draw_dest_arrow()

    def _draw_dest_arrow(self) -> None:
        """Draw an arrow on screen edges toward destination when off-screen."""
        dx = self.dest_rect.centerx - self.player.x
        dy = self.dest_rect.centery - self.player.y
        dist = math.hypot(dx, dy)
        if dist < 200:
            return
        angle = math.atan2(dy, dx)
        margin = 30
        ax = SCREEN_WIDTH  // 2 + math.cos(angle) * (SCREEN_WIDTH  // 2 - margin)
        ay = SCREEN_HEIGHT // 2 + math.sin(angle) * (SCREEN_HEIGHT // 2 - margin)
        # Clamp to screen
        ax = max(margin, min(SCREEN_WIDTH  - margin, ax))
        ay = max(margin, min(SCREEN_HEIGHT - margin, ay))
        # Triangle
        tip    = (int(ax), int(ay))
        left_  = (int(ax - math.cos(angle + 2.4) * 12),
                  int(ay - math.sin(angle + 2.4) * 12))
        right_ = (int(ax - math.cos(angle - 2.4) * 12),
                  int(ay - math.sin(angle - 2.4) * 12))
        pulse = abs(math.sin(pygame.time.get_ticks() / 500))
        alpha = int(160 + 90 * pulse)
        s = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        pygame.draw.polygon(s, (240, 200, 60, alpha), [tip, left_, right_])
        self.screen.blit(s, (0, 0))

    def _draw_minimap(self) -> None:
        mm_w, mm_h = 150, 112
        mm_x, mm_y = 10, SCREEN_HEIGHT - mm_h - 10
        scale_x = mm_w / MAP_WIDTH
        scale_y = mm_h / MAP_HEIGHT

        bg = pygame.Surface((mm_w, mm_h), pygame.SRCALPHA)
        bg.fill((0, 0, 0, 140))
        self.screen.blit(bg, (mm_x, mm_y))

        # Draw walls as dots
        for row in range(0, MAP_ROWS, 3):
            for col in range(0, MAP_COLS, 3):
                tile = self.grid[row][col]
                if tile == TILE_WALL:
                    px2 = int(col * TILE_SIZE * scale_x)
                    py2 = int(row * TILE_SIZE * scale_y)
                    pygame.draw.rect(self.screen, (60, 50, 50), (mm_x + px2, mm_y + py2, 2, 2))
                elif tile == TILE_DEST:
                    px2 = int(col * TILE_SIZE * scale_x)
                    py2 = int(row * TILE_SIZE * scale_y)
                    pygame.draw.rect(self.screen, (240, 200, 60), (mm_x + px2, mm_y + py2, 2, 2))

        # Player dot
        ppx = int(self.player.x * scale_x)
        ppy = int(self.player.y * scale_y)
        pygame.draw.circle(self.screen, (80, 180, 255), (mm_x + ppx, mm_y + ppy), 3)

        # Monster dots
        for m in self.spawner.monsters:
            mpx = int(m.x * scale_x)
            mpy = int(m.y * scale_y)
            pygame.draw.circle(self.screen, (220, 50, 50), (mm_x + mpx, mm_y + mpy), 2)

        # Border
        pygame.draw.rect(self.screen, (80, 80, 100), (mm_x, mm_y, mm_w, mm_h), 1)

    def _draw_death_screen(self) -> None:
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        alpha = min(200, int(self._dead_timer * 100))
        overlay.fill((100, 0, 0, alpha))
        self.screen.blit(overlay, (0, 0))

        txt = self._big_font.render('YOU DIED', True, (255, 60, 60))
        self.screen.blit(txt, (SCREEN_WIDTH // 2 - txt.get_width() // 2, SCREEN_HEIGHT // 2 - 40))

        sub = self._small_font.render('Press [Enter] or [Space] to return to lobby',
                                      True, C_WHITE)
        self.screen.blit(sub, (SCREEN_WIDTH // 2 - sub.get_width() // 2, SCREEN_HEIGHT // 2 + 30))
