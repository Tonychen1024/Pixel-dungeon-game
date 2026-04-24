"""Entry point for Pixel Dungeon game."""
import sys
import pygame

from game.constants import SCREEN_WIDTH, SCREEN_HEIGHT, FPS
from game.states import GameState
from game.lobby import Lobby
from game.how_to_play import HowToPlay
from game.skill_order import SkillOrder
from game.level1 import Level1
from game.win_screen import WinScreen


def main() -> None:
    pygame.init()
    pygame.mixer.init(frequency=22050, size=-16, channels=2, buffer=512)

    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption('Pixel Dungeon')
    clock = pygame.time.Clock()

    # Pre-load sounds in background
    from game import sounds as _sounds_module
    _sounds_module.load_sounds()

    state = GameState.LOBBY
    screens: dict = {
        GameState.LOBBY:       Lobby(screen),
        GameState.HOW_TO_PLAY: HowToPlay(screen),
        GameState.SKILL_ORDER: SkillOrder(screen),
        GameState.WIN:         WinScreen(screen),
        GameState.LEVEL1:      None,
    }
    current = screens[GameState.LOBBY]

    running = True
    while running:
        dt = min(clock.tick(FPS) / 1000.0, 0.05)  # cap at 50 ms

        events = pygame.event.get()
        for event in events:
            if event.type == pygame.QUIT:
                running = False

        result = current.update(dt, events)

        if result is not None:
            next_state, data = result
            # Re-create level each time we enter it
            if next_state == GameState.LEVEL1:
                screens[GameState.LEVEL1] = Level1(screen, data.get('skill_order', [0, 1, 2]))
            # Re-create skill order screen so it resets
            elif next_state == GameState.SKILL_ORDER:
                screens[GameState.SKILL_ORDER] = SkillOrder(screen)
            state = next_state
            current = screens[state]

        current.draw()
        pygame.display.flip()

    pygame.quit()
    sys.exit()


if __name__ == '__main__':
    main()
