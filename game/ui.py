"""HUD: HP bar + skill slots at bottom-right."""
import pygame
from .constants import (
    SCREEN_WIDTH, SCREEN_HEIGHT,
    PLAYER_HP, C_DARK_BG, C_WHITE, C_RED, C_GREEN, C_YELLOW, C_ORANGE,
    C_BLUE, C_DARK_GRAY, C_LIGHT_GRAY,
    SKILL_RANGED_CD, SKILL_MELEE_CD, SKILL_SHIELD_CD,
)

SLOT_SIZE   = 52
SLOT_MARGIN = 6
SLOT_COUNT  = 3


def _get_font(size: int) -> pygame.font.Font:
    return pygame.font.SysFont('Arial', size, bold=True)


def draw_hud(surface: pygame.Surface, player) -> None:
    _draw_hp_bar(surface, player)
    _draw_skill_slots(surface, player)


def _draw_hp_bar(surface: pygame.Surface, player) -> None:
    bar_w = 260
    bar_h = 20
    x = 14
    y = 14

    # Shadow
    pygame.draw.rect(surface, (0, 0, 0), (x - 1, y - 1, bar_w + 2, bar_h + 2))
    # Background
    pygame.draw.rect(surface, (60, 20, 20), (x, y, bar_w, bar_h))
    # Fill
    frac = max(0.0, player.hp / player.max_hp)
    fill_color = C_RED if frac < 0.3 else C_GREEN
    pygame.draw.rect(surface, fill_color, (x, y, int(bar_w * frac), bar_h))
    # Border
    pygame.draw.rect(surface, C_LIGHT_GRAY, (x, y, bar_w, bar_h), 2)

    # HP text
    font = _get_font(14)
    text = font.render(f'HP  {player.hp} / {player.max_hp}', True, C_WHITE)
    surface.blit(text, (x + 4, y + 3))


def _draw_skill_slots(surface: pygame.Surface, player) -> None:
    total_w = SLOT_COUNT * SLOT_SIZE + (SLOT_COUNT - 1) * SLOT_MARGIN
    sx = SCREEN_WIDTH  - total_w - 14
    sy = SCREEN_HEIGHT - SLOT_SIZE - 14

    skill_names = ['R', 'M', 'S']  # short labels

    for i, skill in enumerate(player.skills):
        x = sx + i * (SLOT_SIZE + SLOT_MARGIN)
        y = sy

        active = (i == player.skill_index)

        # Background
        bg_color = (40, 40, 60) if not active else (70, 65, 20)
        pygame.draw.rect(surface, bg_color, (x, y, SLOT_SIZE, SLOT_SIZE))

        # Skill icon (colored circle)
        icon_center = (x + SLOT_SIZE // 2, y + SLOT_SIZE // 2 - 4)
        pygame.draw.circle(surface, skill.icon_color, icon_center, 16)
        # Skill name letter
        font = _get_font(14)
        lbl = font.render(skill.name[:1], True, C_WHITE)
        surface.blit(lbl, (icon_center[0] - lbl.get_width() // 2,
                           icon_center[1] - lbl.get_height() // 2))

        # Cooldown overlay
        if not skill.ready:
            frac = skill.cd_fraction
            overlay = pygame.Surface((SLOT_SIZE, SLOT_SIZE), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, int(160 * frac)))
            surface.blit(overlay, (x, y))
            # CD text
            cd_font = _get_font(11)
            cd_text = cd_font.render(f'{skill._cd_timer:.1f}s', True, C_WHITE)
            surface.blit(cd_text, (x + SLOT_SIZE // 2 - cd_text.get_width() // 2,
                                   y + SLOT_SIZE - 16))

        # Active highlight border
        border_color = C_YELLOW if active else C_DARK_GRAY
        border_w = 3 if active else 1
        pygame.draw.rect(surface, border_color, (x, y, SLOT_SIZE, SLOT_SIZE), border_w)

        # Slot number
        num_font = _get_font(11)
        num = num_font.render(str(i + 1), True, C_LIGHT_GRAY)
        surface.blit(num, (x + 3, y + 3))
