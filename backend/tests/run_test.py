
import os
import sys

# Make the backend package importable regardless of the working directory
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

# Test if we can read the environment variables
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(_BACKEND_DIR), '.env'))
    load_dotenv()
    print('Environment variables loaded successfully')
    print('DB_URL:', os.getenv('DB_URL', 'Not set'))
    print('JWT_SECRET:', os.getenv('JWT_SECRET', 'Not set'))
    print('REDIS_URL:', os.getenv('REDIS_URL', 'Not set'))
except Exception as e:
    print('Error loading environment:', str(e))
    print('Python path:', sys.path)

# Test if we can import the main application
try:
    import main
    print('Main application imported successfully')
except Exception as e:
    print('Error importing main application:', str(e))

