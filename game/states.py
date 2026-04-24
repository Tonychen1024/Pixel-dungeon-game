from enum import Enum, auto


class GameState(Enum):
    LOBBY       = auto()
    HOW_TO_PLAY = auto()
    SKILL_ORDER = auto()
    LEVEL1      = auto()
    WIN         = auto()
