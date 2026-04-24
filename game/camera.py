import pygame
from .constants import SCREEN_WIDTH, SCREEN_HEIGHT, MAP_WIDTH, MAP_HEIGHT


class Camera:
    """Translates world coordinates to screen coordinates, clamped to map."""

    def __init__(self):
        self.offset_x = 0
        self.offset_y = 0

    def update(self, target_rect: pygame.Rect) -> None:
        # Center on target
        cx = target_rect.centerx - SCREEN_WIDTH // 2
        cy = target_rect.centery - SCREEN_HEIGHT // 2
        # Clamp to map boundaries
        self.offset_x = max(0, min(cx, MAP_WIDTH  - SCREEN_WIDTH))
        self.offset_y = max(0, min(cy, MAP_HEIGHT - SCREEN_HEIGHT))

    def apply(self, rect: pygame.Rect) -> pygame.Rect:
        return rect.move(-self.offset_x, -self.offset_y)

    def apply_point(self, x: float, y: float) -> tuple[float, float]:
        return x - self.offset_x, y - self.offset_y

    def world_to_screen(self, x: float, y: float) -> tuple[float, float]:
        return x - self.offset_x, y - self.offset_y

    def screen_to_world(self, sx: float, sy: float) -> tuple[float, float]:
        return sx + self.offset_x, sy + self.offset_y
