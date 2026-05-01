from typing import Dict, Type
from sqlalchemy.orm import Session
from infrastructure.database.postgres.session import SessionLocal
from infrastructure.database.postgres.user_repository_impl import UserRepositoryImpl
from domain.repositories.user_repository import UserRepository
from infrastructure.database.postgres.epub_parser import EPUBParser


class DIContainer:
    """Dependency Injection Container for the application"""
    
    def __init__(self):
        self._services: Dict[Type, object] = {}
    
    def register(self, interface: Type, implementation: object):
        """Register a service implementation"""
        self._services[interface] = implementation
    
    def get(self, interface: Type):
        """Resolve a service implementation"""
        return self._services.get(interface)
    
    def get_db_session(self) -> Session:
        """Get database session"""
        return SessionLocal()
    
    def get_user_repository(self) -> UserRepository:
        """Get user repository instance"""
        db_session = self.get_db_session()
        return UserRepositoryImpl(db_session)
    
    def get_epub_parser(self) -> EPUBParser:
        """Get EPUB parser instance"""
        db_session = self.get_db_session()
        return EPUBParser(db_session)


# Global DI container instance
container = DIContainer()
