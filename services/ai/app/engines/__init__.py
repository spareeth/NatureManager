"""Species engines. Each returns a list of (scientific_name, score 0..1), best first."""

from dataclasses import dataclass


@dataclass
class Image:
    data: bytes
    organ: str  # leaf, flower, fruit, bark, habit, auto
    content_type: str = "image/jpeg"


Scored = list[tuple[str, float]]
