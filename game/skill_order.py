"""Skill ordering screen – drag & drop to reorder the 3 skill slots."""
from __future__ import annotations
import pygame
from .states import GameState
from .constants import (
    SCREEN_WIDTH, SCREEN_HEIGHT, C_DARK_BG, C_WHITE, C_YELLOW, C_LIGHT_GRAY,
    C_ORANGE, C_BLUE, C_DARK_GRAY,
)

_CARD_W = 200
_CARD_H = 90
_CARD_GAP = 30
_CARD_RADIUS = 10

_SKILL_INFO = [
    {
        'name': 'Ranged Attack',
        'desc': ['Fire a projectile at cursor', 'Damage: 1000  |  CD: 2s'],
        'color': (60, 130, 220),
        'icon': 'R',
    },
    {
        'name': 'Melee Attack',
        'desc': ['Slash nearby enemies', 'Damage: 2000  |  CD: 2s'],
        'color': (220, 110, 30),
        'icon': 'M',
    },
    {
        'name': 'Shield',
        'desc': ['50% damage reduction', 'Duration: 3s  |  CD: 5s'],
        'color': (200, 190, 30),
        'icon': 'S',
    },
]


class SkillOrder:
    def __init__(self, screen: pygame.Surface):
        self.screen = screen
        # skill_order[i] = original skill index in slot i
        self.skill_order: list[int] = [0, 1, 2]

        # Drag state
        self._dragging: int | None = None   # slot index being dragged
        self._drag_offset = (0, 0)
        self._drag_pos = (0, 0)

        self._title_font = pygame.font.SysFont('Arial', 36, bold=True)
        self._body_font  = pygame.font.SysFont('Arial', 16)
        self._small_font = pygame.font.SysFont('Arial', 13)
        self._confirm_rect = pygame.Rect(SCREEN_WIDTH // 2 - 110, SCREEN_HEIGHT - 70, 220, 48)

    # ── Layout helpers ────────────────────────────────────────────────────────

    def _card_rect(self, slot: int) -> pygame.Rect:
        total_h = len(self.skill_order) * _CARD_H + (len(self.skill_order) - 1) * _CARD_GAP
        top_y = (SCREEN_HEIGHT - total_h) // 2 + 30
        x = SCREEN_WIDTH // 2 - _CARD_W // 2
        y = top_y + slot * (_CARD_H + _CARD_GAP)
        return pygame.Rect(x, y, _CARD_W, _CARD_H)

    # ── Event / update ────────────────────────────────────────────────────────

    def update(self, dt: float, events: list) -> tuple | None:
        for event in events:
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if self._confirm_rect.collidepoint(event.pos):
                    return (GameState.LEVEL1, {'skill_order': list(self.skill_order)})
                # Start drag
                for slot in range(len(self.skill_order)):
                    r = self._card_rect(slot)
                    if r.collidepoint(event.pos):
                        self._dragging = slot
                        self._drag_offset = (event.pos[0] - r.x, event.pos[1] - r.y)
                        self._drag_pos = event.pos
                        break

            elif event.type == pygame.MOUSEMOTION and self._dragging is not None:
                self._drag_pos = event.pos
                # Reorder based on drag Y position
                new_slot = self._y_to_slot(event.pos[1])
                if new_slot != self._dragging:
                    # Swap
                    o = self.skill_order
                    o[self._dragging], o[new_slot] = o[new_slot], o[self._dragging]
                    self._dragging = new_slot

            elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                self._dragging = None

            elif event.type == pygame.KEYDOWN and event.key == pygame.K_RETURN:
                return (GameState.LEVEL1, {'skill_order': list(self.skill_order)})

        return None

    def _y_to_slot(self, y: int) -> int:
        best_slot = self._dragging
        best_dist = float('inf')
        for slot in range(len(self.skill_order)):
            r = self._card_rect(slot)
            dist = abs(y - r.centery)
            if dist < best_dist:
                best_dist = dist
                best_slot = slot
        return best_slot

    # ── Draw ──────────────────────────────────────────────────────────────────

    def draw(self) -> None:
        self.screen.fill(C_DARK_BG)

        # Title
        title = self._title_font.render('Skill Order', True, C_YELLOW)
        self.screen.blit(title, (SCREEN_WIDTH // 2 - title.get_width() // 2, 30))
        hint = self._small_font.render('Drag cards to reorder.  Slot 1 activates first.',
                                       True, C_LIGHT_GRAY)
        self.screen.blit(hint, (SCREEN_WIDTH // 2 - hint.get_width() // 2, 80))

        # Slot labels on the left
        for slot in range(len(self.skill_order)):
            r = self._card_rect(slot)
            lbl = self._body_font.render(f'Slot {slot + 1}', True, (100, 100, 130))
            self.screen.blit(lbl, (r.x - 70, r.centery - lbl.get_height() // 2))

        # Draw cards (skip dragged one first)
        for slot in range(len(self.skill_order)):
            if slot != self._dragging:
                self._draw_card(slot, self._card_rect(slot))

        # Draw dragged card on top
        if self._dragging is not None:
            px, py = self._drag_pos
            ox, oy = self._drag_offset
            drag_rect = pygame.Rect(px - ox, py - oy, _CARD_W, _CARD_H)
            self._draw_card(self._dragging, drag_rect, dragging=True)

        # Confirm button
        mx, my = pygame.mouse.get_pos()
        hov = self._confirm_rect.collidepoint(mx, my)
        pygame.draw.rect(self.screen, (40, 100, 50) if hov else (30, 80, 40),
                         self._confirm_rect, border_radius=8)
        pygame.draw.rect(self.screen, C_YELLOW if hov else (70, 140, 80),
                         self._confirm_rect, 2, border_radius=8)
        lbl = self._body_font.render('Confirm & Start  [Enter]', True, C_WHITE)
        self.screen.blit(lbl, (self._confirm_rect.centerx - lbl.get_width() // 2,
                               self._confirm_rect.centery - lbl.get_height() // 2))

    def _draw_card(self, slot: int, rect: pygame.Rect, dragging: bool = False) -> None:
        skill_idx = self.skill_order[slot]
        info = _SKILL_INFO[skill_idx]

        # Background
        alpha = 220 if dragging else 255
        bg = (50, 50, 75) if not dragging else (65, 65, 95)
        pygame.draw.rect(self.screen, bg, rect, border_radius=_CARD_RADIUS)

        # Colored side bar
        pygame.draw.rect(self.screen, info['color'],
                         pygame.Rect(rect.x, rect.y, 8, rect.h), border_radius=4)

        # Icon circle
        ic = (rect.x + 30, rect.centery)
        pygame.draw.circle(self.screen, info['color'], ic, 20)
        icon_surf = self._title_font.render(info['icon'], True, C_WHITE)
        self.screen.blit(icon_surf, (ic[0] - icon_surf.get_width() // 2,
                                     ic[1] - icon_surf.get_height() // 2))

        # Name
        name_surf = self._body_font.render(info['name'], True, C_WHITE)
        self.screen.blit(name_surf, (rect.x + 60, rect.y + 12))

        # Description lines
        for i, line in enumerate(info['desc']):
            d_surf = self._small_font.render(line, True, C_LIGHT_GRAY)
            self.screen.blit(d_surf, (rect.x + 60, rect.y + 36 + i * 18))

        # Border
        border_color = C_YELLOW if dragging else (80, 80, 110)
        pygame.draw.rect(self.screen, border_color, rect, 2, border_radius=_CARD_RADIUS)
