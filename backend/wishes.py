"""Доменная логика желаний (пока без хранения).

Прогресс всегда вычисляется из шагов, а не приходит от клиента:
это защищает от рассинхрона «100%, но ни один шаг не отмечен».
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.schemas import WishStep

MIN_PLAN_STEPS = 3
MAX_PLAN_STEPS = 7


def compute_progress(steps: Sequence[WishStep]) -> int:
    if not steps:
        return 0

    done = sum(1 for step in steps if step.done)
    return max(0, min(100, round(done * 100 / len(steps))))


def clamp_plan(steps: Sequence[WishStep]) -> list[WishStep]:
    """План рыбки — от 3 до 7 шагов; лишние мягко отбрасываем."""
    return list(steps[:MAX_PLAN_STEPS])
