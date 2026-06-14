import sys
import os
import types

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_module = types.ModuleType("backend")
backend_module.__path__ = [current_dir]
sys.modules["backend"] = backend_module

try:

    print("Success")
except Exception:
    import traceback

    traceback.print_exc()
