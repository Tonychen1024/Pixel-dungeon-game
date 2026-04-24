"""How to Play – English instruction screen."""
import pygame
from .states import GameState
from .constants import SCREEN_WIDTH, SCREEN_HEIGHT, C_DARK_BG, C_WHITE, C_YELLOW, C_LIGHT_GRAY

_LINES = [
    ('PIXEL DUNGEON – HOW TO PLAY', True, C_YELLOW, 28),
    ('', False, C_WHITE, 12),
    ('Movement', True, (120, 180, 255), 20),
    ('  Use W A S D (or Arrow Keys) to move your character around the map.', False, C_LIGHT_GRAY, 16),
    ('', False, C_WHITE, 8),
    ('Skills', True, (120, 180, 255), 20),
    ('  You have 3 skills assigned to the bottom-right skill slots.', False, C_LIGHT_GRAY, 16),
    ('  Right-Click  — cycle through skills (1 → 2 → 3 → 1 …)', False, C_LIGHT_GRAY, 16),
    ('  Left-Click   — activate the currently highlighted skill.', False, C_LIGHT_GRAY, 16),
    ('', False, C_WHITE, 8),
    ('  Skill 1 – Ranged Attack', True, (80, 160, 255), 17),
    ('    Fire a projectile toward the mouse cursor.', False, C_LIGHT_GRAY, 15),
    ('    Damage: 1000  |  Cooldown: 2 s', False, C_LIGHT_GRAY, 15),
    ('', False, C_WHITE, 6),
    ('  Skill 2 – Melee Attack', True, (240, 140, 30), 17),
    ('    Slash enemies in the direction of your cursor (short range).', False, C_LIGHT_GRAY, 15),
    ('    Damage: 2000  |  Cooldown: 2 s', False, C_LIGHT_GRAY, 15),
    ('', False, C_WHITE, 6),
    ('  Skill 3 – Shield', True, (240, 220, 50), 17),
    ('    Activate a protective shield that reduces incoming damage by 50%.', False, C_LIGHT_GRAY, 15),
    ('    Duration: 3 s  |  Cooldown: 5 s', False, C_LIGHT_GRAY, 15),
    ('', False, C_WHITE, 8),
    ('Goal', True, (120, 180, 255), 20),
    ('  Reach the destination tile at the edge of the map to win!', False, C_LIGHT_GRAY, 16),
    ('  You do NOT need to kill all monsters.', False, C_LIGHT_GRAY, 16),
    ('', False, C_WHITE, 8),
    ('Enemies', True, (120, 180, 255), 20),
    ('  Monsters chase you and attack on contact (3000 dmg) or at range (500 dmg).', False, C_LIGHT_GRAY, 16),
    ('  Each monster has 5000 HP and respawns 5 s after death.', False, C_LIGHT_GRAY, 16),
    ('', False, C_WHITE, 14),
    ('Press  [BACKSPACE]  or click  "Back"  to return to the lobby.', True, (180, 180, 200), 15),
]


class HowToPlay:
    def __init__(self, screen: pygame.Surface):
        self.screen = screen
        self._back_rect = pygame.Rect(SCREEN_WIDTH // 2 - 80, SCREEN_HEIGHT - 50, 160, 38)
        self._font_cache: dict = {}

    def _font(self, size: int, bold: bool) -> pygame.font.Font:
        key = (size, bold)
        if key not in self._font_cache:
            self._font_cache[key] = pygame.font.SysFont('Arial', size, bold=bold)
        return self._font_cache[key]

    def update(self, dt: float, events: list) -> tuple | None:
        for event in events:
            if event.type == pygame.KEYDOWN and event.key == pygame.K_BACKSPACE:
                return (GameState.LOBBY, {})
            if (event.type == pygame.MOUSEBUTTONDOWN and event.button == 1
                    and self._back_rect.collidepoint(event.pos)):
                return (GameState.LOBBY, {})
        return None

    def draw(self) -> None:
        self.screen.fill(C_DARK_BG)

        y = 20
        for text, bold, color, size in _LINES:
            if not text:
                y += size
                continue
            font = self._font(size, bold)
            surf = font.render(text, True, color)
            self.screen.blit(surf, (30, y))
            y += surf.get_height() + 2

        # Back button
        mx, my = pygame.mouse.get_pos()
        hov = self._back_rect.collidepoint(mx, my)
        pygame.draw.rect(self.screen, (80, 90, 120) if hov else (50, 60, 90),
                         self._back_rect, border_radius=6)
        pygame.draw.rect(self.screen, C_YELLOW if hov else (100, 100, 150),
                         self._back_rect, 2, border_radius=6)
        lbl = self._font(18, True).render('Back', True, C_WHITE)
        self.screen.blit(lbl, (self._back_rect.centerx - lbl.get_width() // 2,
                               self._back_rect.centery - lbl.get_height() // 2))
