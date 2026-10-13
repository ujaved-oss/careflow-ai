import argparse
import asyncio

import asyncpg


async def prepare(port):
    for attempt in range(40):
        try:
            connection = await asyncpg.connect(f"postgresql://careflow@127.0.0.1:{port}/postgres")
            break
        except (OSError, asyncpg.PostgresError):
            if attempt == 39:
                raise
            await asyncio.sleep(0.25)
    for name in ("careflow", "careflow_test"):
        if not await connection.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", name):
            await connection.execute(f'CREATE DATABASE "{name}"')
    await connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=55432)
    asyncio.run(prepare(parser.parse_args().port))
