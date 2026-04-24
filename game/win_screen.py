"""Win screen shown when the player reaches the destination."""
import pygame
from .states import GameState
from .constants import SCREEN_WIDTH, SCREEN_HEIGHT, C_DARK_BG, C_WHITE, C_YELLOW, C_LIGHT_GRAY


class WinScreen:
    def __init__(self, screen: pygame.Surface):
        self.screen = screen
        self._timer = 0.0
        self._big_font   = pygame.font.SysFont('Arial', 64, bold=True)
        self._med_font   = pygame.font.SysFont('Arial', 24)
        self._small_font = pygame.font.SysFont('Arial', 18)
        self._btn_rect = pygame.Rect(SCREEN_WIDTH // 2 - 120, 380, 240, 54)

    def update(self, dt: float, events: list) -> tuple | None:
        self._timer += dt
        for event in events:
            if event.type == pygame.KEYDOWN and event.key in (pygame.K_RETURN, pygame.K_SPACE):
                self._timer = 0.0
                return (GameState.LOBBY, {})
            if (event.type == pygame.MOUSEBUTTONDOWN and event.button == 1
                    and self._btn_rect.collidepoint(event.pos)):
                self._timer = 0.0
                return (GameState.LOBBY, {})
        return None

    def draw(self) -> None:
        import math
        self.screen.fill(C_DARK_BG)

        # Pulsing glow
        glow_r = int(30 + 15 * abs(math.sin(self._timer * 1.5)))
        for i in range(glow_r, 0, -4):
            alpha = max(0, 60 - i * 2)
            s = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            pygame.draw.circle(s, (200, 200, 50, alpha),
                               (SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 40), 100 + i)
            self.screen.blit(s, (0, 0))

        # Title
        shadow = self._big_font.render('YOU WIN!', True, (60, 60, 0))
        title  = self._big_font.render('YOU WIN!', True, C_YELLOW)
        tx = SCREEN_WIDTH // 2 - title.get_width() // 2
        self.screen.blit(shadow, (tx + 4, 154))
        self.screen.blit(title,  (tx, 150))

        msg = self._med_font.render('You reached the destination!', True, C_WHITE)
        self.screen.blit(msg, (SCREEN_WIDTH // 2 - msg.get_width() // 2, 250))

        sub = self._small_font.render('Press [Enter] or [Space] to return to lobby', True, C_LIGHT_GRAY)
        self.screen.blit(sub, (SCREEN_WIDTH // 2 - sub.get_width() // 2, 300))

        # Button
        mx, my = pygame.mouse.get_pos()
        hov = self._btn_rect.collidepoint(mx, my)
        pygame.draw.rect(self.screen, (60, 100, 40) if hov else (40, 70, 30),
                         self._btn_rect, border_radius=8)
        pygame.draw.rect(self.screen, C_YELLOW, self._btn_rect, 2, border_radius=8)
        lbl = self._med_font.render('Back to Lobby', True, C_WHITE)
        self.screen.blit(lbl, (self._btn_rect.centerx - lbl.get_width() // 2,
                               self._btn_rect.centery - lbl.get_height() // 2))
