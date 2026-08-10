from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "校园招聘秋招投递助手 Backend"
    app_version: str = "0.1.0"
    repo_root: Path = Path(__file__).resolve().parents[2]
    data_dir: Path = Path(__file__).resolve().parents[1] / "data"
    state_file: Path = Path(__file__).resolve().parents[1] / "data" / "state.json"

    model_config = SettingsConfigDict(env_prefix="QZ_", env_file=".env", extra="ignore")

    @property
    def profile_file(self) -> Path:
        return self.repo_root / "capture_v1" / "profile.json"

    @property
    def preferences_file(self) -> Path:
        return self.repo_root / "capture_v1" / "preferences.json"

    @property
    def sources_file(self) -> Path:
        return self.repo_root / "capture_v1" / "sources.json"

    @property
    def demo_sample_file(self) -> Path:
        return self.repo_root / "capture_v1" / "samples" / "demo_job.json"

    @property
    def telecom_demo_file(self) -> Path:
        return self.repo_root / "capture_v1" / "samples" / "demo_job.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
