"""
Vercel ASGI Handler for FastAPI Application

This file serves as the entry point for Vercel's Python runtime.
It imports and exports the FastAPI app from backend/main.py.
"""

import sys
import os

# Add parent directory to path for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

# Import the FastAPI app from backend
from backend.main import app

# Export for Vercel's ASGI runtime
__all__ = ['app']
