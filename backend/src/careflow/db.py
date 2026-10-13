from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from careflow.config import settings

engine = create_async_engine(settings().database_url, pool_pre_ping=True)
Session = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def guarded_session():
    async with Session() as session:
        async with session.begin():
            await session.execute(
                text(
                    "SELECT pg_advisory_xact_lock_shared(hashtextextended('careflow-demo-reset', 0))"
                )
            )
            yield session


async def get_db() -> AsyncIterator[AsyncSession]:
    async with guarded_session() as session:
        yield session
