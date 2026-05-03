# Backend Refactoring Plan

## Critical Bug Fixes
1. `dependencies.py` — imports `user_repository_impl` (file doesn't exist), fix to `repositories`
2. `auth_router.py` — same broken import

## Cleanup & Readability
3. Clean up unused imports across all files
4. Improve docstrings and type annotations
5. Remove dead/redundant code
6. Consolidate `__init__.py` files

## Verification
7. Verify no broken imports remain
8. Update `.clinerules`