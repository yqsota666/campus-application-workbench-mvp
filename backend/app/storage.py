import json
import threading
from pathlib import Path
from typing import Callable, TypeVar

from .config import get_settings
from .models import State

T = TypeVar("T")
_lock = threading.Lock()


def _ensure_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(State().model_dump_json(indent=2), encoding="utf-8")


def load_state() -> State:
    settings = get_settings()
    _ensure_file(settings.state_file)
    with _lock:
        raw = json.loads(settings.state_file.read_text(encoding="utf-8"))
    return State.model_validate(raw)


def save_state(state: State) -> None:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    tmp = settings.state_file.with_suffix(".json.tmp")
    payload = state.model_dump_json(indent=2)
    with _lock:
        tmp.write_text(payload, encoding="utf-8")
        tmp.replace(settings.state_file)


def update_state(mutator: Callable[[State], T]) -> T:
    state = load_state()
    result = mutator(state)
    save_state(state)
    return result
