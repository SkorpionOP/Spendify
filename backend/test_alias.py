import sys
import os
import types

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_module = types.ModuleType('backend')
backend_module.__path__ = [current_dir]
sys.modules['backend'] = backend_module

try:
    from backend.database.tables import init_tables
    print("Success")
except Exception as e:
    import traceback
    traceback.print_exc()
