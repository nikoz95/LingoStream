import pytest
from unittest.mock import Mock, AsyncMock
from domain.entities.user import User
from domain.repositories.user_repository import UserRepository
from domain.usecases.auth.register_user import RegisterUser, RegisterUserRequest, UserAlreadyExistsError
from domain.usecases.auth.login_user import LoginUser, LoginUserRequest, InvalidCredentialsError


@pytest.fixture
def mock_user_repository():
    return Mock(spec=UserRepository)


@pytest.fixture
def register_usecase(mock_user_repository):
    return RegisterUser(mock_user_repository)


@pytest.fixture
def login_usecase(mock_user_repository):
    return LoginUser(mock_user_repository)


@pytest.mark.asyncio
async def test_register_user_success(register_usecase, mock_user_repository):
    # Setup
    mock_user_repository.get_by_email.return_value = None
    mock_user_repository.add.return_value = User(
        id=1,
        email="test@example.com",
        hashed_password="hashed_password"
    )
    
    # Execute
    request = RegisterUserRequest(email="test@example.com", password="password")
    result = await register_usecase.execute(request)
    
    # Verify
    assert result.id == 1
    assert result.email == "test@example.com"
    mock_user_repository.add.assert_called_once()


@pytest.mark.asyncio
async def test_register_user_already_exists(register_usecase, mock_user_repository):
    # Setup
    mock_user_repository.get_by_email.return_value = User(
        id=1,
        email="test@example.com",
        hashed_password="hashed_password"
    )
    
    # Execute & Verify
    request = RegisterUserRequest(email="test@example.com", password="password")
    with pytest.raises(UserAlreadyExistsError):
        await register_usecase.execute(request)


@pytest.mark.asyncio
async def test_login_user_success(login_usecase, mock_user_repository):
    # Setup
    mock_user_repository.get_by_email.return_value = User(
        id=1,
        email="test@example.com",
        hashed_password="hashed_password"
    )
    
    # Execute
    request = LoginUserRequest(email="test@example.com", password="password")
    result = await login_usecase.execute(request)
    
    # Verify
    assert result.token_type == "bearer"
    assert result.user.email == "test@example.com"


@pytest.mark.asyncio
async def test_login_user_invalid_credentials(login_usecase, mock_user_repository):
    # Setup
    mock_user_repository.get_by_email.return_value = None
    
    # Execute & Verify
    request = LoginUserRequest(email="test@example.com", password="password")
    with pytest.raises(InvalidCredentialsError):
        await login_usecase.execute(request)