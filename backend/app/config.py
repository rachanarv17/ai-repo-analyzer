"""
Application configuration using Pydantic BaseSettings.
All settings are loaded from environment variables with sensible defaults.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./test.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI Service
    OPENAI_API_KEY: str = ""
    AI_MODEL: str = "gpt-4o-mini"

    # App
    APP_ENV: str = "development"
    CLONE_BASE_DIR: str = "/tmp/repo_clones"
    MAX_REPO_SIZE_MB: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
