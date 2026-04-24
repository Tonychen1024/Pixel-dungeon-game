"""Procedural sound generation using numpy + pygame.sndarray."""
import pygame
import numpy as np

SAMPLE_RATE = 22050


def _make_sound(samples: np.ndarray) -> pygame.mixer.Sound:
    samples = np.clip(samples, -32767, 32767).astype(np.int16)
    stereo = np.column_stack([samples, samples])
    return pygame.sndarray.make_sound(stereo)


def _envelope(length: int, attack: float = 0.02, release: float = 0.15) -> np.ndarray:
    env = np.ones(length, dtype=np.float32)
    atk = int(attack * SAMPLE_RATE)
    rel = int(release * SAMPLE_RATE)
    if atk > 0:
        env[:atk] = np.linspace(0, 1, atk)
    if rel > 0 and rel <= length:
        env[-rel:] = np.linspace(1, 0, rel)
    return env


def make_ranged_attack_sound() -> pygame.mixer.Sound:
    """High-pitched 'pew' laser sound."""
    duration = 0.18
    n = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n)
    freq = np.linspace(900, 400, n)
    wave = np.sin(2 * np.pi * np.cumsum(freq) / SAMPLE_RATE)
    wave *= _envelope(n, attack=0.005, release=0.1) * 22000
    return _make_sound(wave)


def make_melee_attack_sound() -> pygame.mixer.Sound:
    """Low thud / slash sound."""
    duration = 0.22
    n = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n)
    noise = np.random.normal(0, 1, n).astype(np.float32)
    freq = 180
    tone = np.sin(2 * np.pi * freq * t)
    wave = (noise * 0.6 + tone * 0.4) * _envelope(n, attack=0.005, release=0.18) * 20000
    return _make_sound(wave)


def make_hit_sound() -> pygame.mixer.Sound:
    """Player takes damage – low impact thud."""
    duration = 0.25
    n = int(SAMPLE_RATE * duration)
    noise = np.random.normal(0, 1, n).astype(np.float32)
    freq = 90
    t = np.linspace(0, duration, n)
    tone = np.sin(2 * np.pi * freq * t)
    wave = (noise * 0.5 + tone * 0.5) * _envelope(n, attack=0.01, release=0.2) * 18000
    return _make_sound(wave)


def make_shield_sound() -> pygame.mixer.Sound:
    """Activation hum."""
    duration = 0.3
    n = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n)
    wave = (np.sin(2 * np.pi * 320 * t) + 0.4 * np.sin(2 * np.pi * 640 * t))
    wave *= _envelope(n, attack=0.05, release=0.15) * 15000
    return _make_sound(wave)


# Module-level cache
_sounds: dict = {}


def load_sounds() -> dict:
    global _sounds
    if not _sounds:
        try:
            _sounds = {
                'ranged':  make_ranged_attack_sound(),
                'melee':   make_melee_attack_sound(),
                'hit':     make_hit_sound(),
                'shield':  make_shield_sound(),
            }
        except Exception:
            # If sound generation fails, use silent placeholders
            _sounds = {k: None for k in ('ranged', 'melee', 'hit', 'shield')}
    return _sounds


def play(name: str) -> None:
    sounds = load_sounds()
    s = sounds.get(name)
    if s is not None:
        s.play()
