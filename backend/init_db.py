import asyncio
from infrastructure.database.postgres.session import engine, Base

async def init_db():
    '''Initialize database tables'''
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print('Database tables created successfully')
    except Exception as e:
        print(f'Error creating database tables: {e}')

if __name__ == '__main__':
    asyncio.run(init_db())
