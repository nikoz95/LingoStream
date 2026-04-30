import hashlib
import secrets
from typing import Tuple


class PasswordService:
    """Service for hashing and verifying passwords"""
    
    @staticmethod
    def hash_password(password: str) -> Tuple[str, str]:
        """
        Hash a password with a salt.
        Returns tuple of (hashed_password, salt)
        """
        salt = secrets.token_hex(16)
        pwdhash = hashlib.pbkdf2_hmac('sha256', 
                                      password.encode('utf-8'), 
                                      salt.encode('utf-8'), 
                                      100000)
        hashed = pwdhash.hex()
        return hashed, salt
    
    @staticmethod
    def verify_password(password: str, stored_hash: str, salt: str) -> bool:
        """
        Verify a password against its hash
        """
        pwdhash = hashlib.pbkdf2_hmac('sha256',
                                      password.encode('utf-8'),
                                      salt.encode('utf-8'),
                                      100000)
        return pwdhash.hex() == stored_hash