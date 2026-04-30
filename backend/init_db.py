from infrastructure.database.postgres.session import engine, Base
from infrastructure.database.postgres.models import User

def init_db():
    '''Initialize database tables'''
    try:
        Base.metadata.create_all(bind=engine)
        print('Database tables created successfully')
    except Exception as e:
        print(f'Error creating database tables: {e}')

if __name__ == '__main__':
    init_db()
