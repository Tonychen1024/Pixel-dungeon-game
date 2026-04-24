"""Game Lobby screen."""
import pygame
from .states import GameState
from .constants import SCREEN_WIDTH, SCREEN_HEIGHT, C_DARK_BG, C_WHITE, C_YELLOW, C_LIGHT_GRAY

_BTN_W = 240
_BTN_H = 56
_BTN_RADIUS = 8


class Button:
    def __init__(self, rect: pygame.Rect, text: str,
                 color=(60, 60, 100), hover_color=(90, 90, 150),
                 text_color=(255, 255, 255)):
        self.rect = rect
        self.text = text
        self.color = color
        self.hover_color = hover_color
        self.text_color = text_color
        self._font = pygame.font.SysFont('Arial', 22, bold=True)

    def draw(self, surface: pygame.Surface) -> None:
        mx, my = pygame.mouse.get_pos()
        hovered = self.rect.collidepoint(mx, my)
        color = self.hover_color if hovered else self.color
        pygame.draw.rect(surface, color, self.rect, border_radius=_BTN_RADIUS)
        pygame.draw.rect(surface, C_YELLOW if hovered else (100, 100, 160),
                         self.rect, 2, border_radius=_BTN_RADIUS)
        lbl = self._font.render(self.text, True, self.text_color)
        surface.blit(lbl, (self.rect.centerx - lbl.get_width() // 2,
                           self.rect.centery - lbl.get_height() // 2))

    def is_clicked(self, event: pygame.event.Event) -> bool:
        return (event.type == pygame.MOUSEBUTTONDOWN and
                event.button == 1 and
                self.rect.collidepoint(event.pos))


class Lobby:
    def __init__(self, screen: pygame.Surface):
        self.screen = screen
        cx = SCREEN_WIDTH // 2

        self._btn_start = Button(
            pygame.Rect(cx - _BTN_W // 2, 300, _BTN_W, _BTN_H),
            'Start Game',
            color=(40, 80, 140), hover_color=(60, 110, 200),
        )
        self._btn_howto = Button(
            pygame.Rect(cx - _BTN_W // 2, 380, _BTN_W, _BTN_H),
            'How to Play',
            color=(50, 60, 80), hover_color=(80, 90, 120),
        )
        self._title_font  = pygame.font.SysFont('Arial', 52, bold=True)
        self._sub_font    = pygame.font.SysFont('Arial', 18)
        self._particle_timer = 0.0
        self._particles: list[dict] = []

    # ── particles for visual flair ────────────────────────────────────────────
    def _update_particles(self, dt: float) -> None:
        import random, math
        self._particle_timer += dt
        if self._particle_timer > 0.12:
            self._particle_timer = 0
            self._particles.append({
                'x': random.uniform(0, SCREEN_WIDTH),
                'y': SCREEN_HEIGHT + 5,
                'vy': -random.uniform(40, 100),
                'vx': random.uniform(-20, 20),
                'life': random.uniform(2.0, 5.0),
                'max_life': 5.0,
                'r': random.randint(2, 4),
            })
        alive = []
        for p in self._particles:
            p['y'] += p['vy'] * dt
            p['x'] += p['vx'] * dt
            p['life'] -= dt
            if p['life'] > 0:
                alive.append(p)
        self._particles = alive

    def update(self, dt: float, events: list) -> tuple | None:
        self._update_particles(dt)
        for event in events:
            if self._btn_start.is_clicked(event):
                return (GameState.SKILL_ORDER, {})
            if self._btn_howto.is_clicked(event):
                return (GameState.HOW_TO_PLAY, {})
        return None

    def draw(self) -> None:
        self.screen.fill(C_DARK_BG)

        # Particles
        for p in self._particles:
            alpha = int(200 * (p['life'] / p['max_life']))
            c = (80, 80, min(255, 150 + alpha // 2))
            pygame.draw.circle(self.screen, c, (int(p['x']), int(p['y'])), p['r'])

        # Title
        shadow = self._title_font.render('PIXEL DUNGEON', True, (30, 30, 60))
        title  = self._title_font.render('PIXEL DUNGEON', True, C_YELLOW)
        tx = SCREEN_WIDTH // 2 - title.get_width() // 2
        self.screen.blit(shadow, (tx + 3, 153))
        self.screen.blit(title,  (tx, 150))

        # Subtitle
        sub = self._sub_font.render('Survive. Explore. Escape.', True, C_LIGHT_GRAY)
        self.screen.blit(sub, (SCREEN_WIDTH // 2 - sub.get_width() // 2, 215))

        self._btn_start.draw(self.screen)
        self._btn_howto.draw(self.screen)

        # Footer
        foot = self._sub_font.render('Right-click to cycle skills | WASD to move | Left-click to use skill',
                                     True, (80, 80, 100))
        self.screen.blit(foot, (SCREEN_WIDTH // 2 - foot.get_width() // 2, SCREEN_HEIGHT - 30))
