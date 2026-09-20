"""Minimale streamlit-stub, alleen om opstelling_generator.py te kunnen
importeren buiten een echte streamlit-runtime om, zodat de pure logica-
functies eruit gehaald en los getest kunnen worden."""

class _Col:
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def write(self, *a, **k): pass
    def markdown(self, *a, **k): pass

class _Sidebar:
    def number_input(self, *a, **k):
        return k.get('value', a[3] if len(a) > 3 else 0)
    def header(self, *a, **k): pass

def set_page_config(*a, **k): pass
def title(*a, **k): pass
def header(*a, **k): pass
def subheader(*a, **k): pass
def write(*a, **k): pass
def error(*a, **k): pass
def warning(*a, **k): pass
def info(*a, **k): pass
def caption(*a, **k): pass
def markdown(*a, **k): pass
def table(*a, **k): pass
def button(*a, **k): return False
def checkbox(*a, **k): return False
def radio(*a, **k):
    opts = k.get('options', [0])
    return opts[0]
def number_input(*a, **k):
    return k.get('value', 0)
def columns(spec, **k):
    n = spec if isinstance(spec, int) else len(spec)
    return [_Col() for _ in range(n)]
def stop(*a, **k):
    raise _StopExec()
def divider(*a, **k): pass
def expander(*a, **k): return _Col()

class _StopExec(Exception):
    pass

sidebar = _Sidebar()
