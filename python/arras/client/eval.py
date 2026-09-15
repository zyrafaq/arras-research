import ast
import hashlib
import math
import operator
import os
import random
import shutil
import subprocess
import tempfile

from .config import log

EVAL_RUNNER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "arras_eval_runner.js")

def eval_js(code, localstorage=None):
    if not code:
        return None
    node = shutil.which("node") or "/usr/bin/node"
    if not os.path.exists(node):
        log.warning("== eval: node not found, falling back to AST")
        return None
    path = None
    try:
        fd, path = tempfile.mkstemp(suffix=".js")
        with os.fdopen(fd, "w") as f:
            f.write(code)
        args = [node, EVAL_RUNNER, path]
        if localstorage:
            args.append(localstorage)
        proc = subprocess.run(args, capture_output=True, timeout=20)
        out = proc.stdout.decode("utf-8", "replace").strip()
        return out if out else None
    except Exception as e:
        log.warning(f"== eval: node failed ({e})")
        return None
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass

_BINOPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod, ast.Pow: operator.pow,
}
_UNOPS = {ast.USub: operator.neg, ast.UAdd: operator.pos}
_MATHFUNS = {
    "abs": abs, "acos": math.acos, "asin": math.asin, "atan": math.atan,
    "atan2": math.atan2, "ceil": math.ceil, "cos": math.cos, "exp": math.exp,
    "floor": math.floor, "hypot": math.hypot, "log": math.log, "log2": math.log2,
    "log10": math.log10, "max": max, "min": min, "pow": math.pow,
    "random": random.random, "round": round, "sign": lambda x: (x > 0) - (x < 0),
    "sin": math.sin, "sqrt": math.sqrt, "tan": math.tan, "trunc": math.trunc,
}


def _js_str(v):
    if isinstance(v, float):
        if math.isnan(v):
            return "NaN"
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        return repr(v)
    return str(v)

def eval_math(code):
    try:
        tree = ast.parse(code.strip().strip(";"), mode="eval")
    except SyntaxError as e:
        log.warning(f"== eval: unparseable ({e}): {code!r}")
        return None

    def ev(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
            return _BINOPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNOPS:
            return _UNOPS[type(node.op)](ev(node.operand))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and isinstance(node.func.value, ast.Name) and node.func.value.id == "Math" \
                and node.func.attr in _MATHFUNS:
            return _MATHFUNS[node.func.attr](*[ev(a) for a in node.args])
        if isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
            vals = [ev(v) for v in node.values]
            return all(vals) if isinstance(node.op, ast.And) else any(vals)
        raise ValueError(f"unsupported node: {ast.dump(node)}")

    try:
        return _js_str(ev(tree.body))
    except Exception as e:
        log.warning(f"== eval: failed ({e}): {code!r}")
        return None

def pow_solve(input_str):
    for i in range(2 ** 22):
        v = i
        d = [0] * 6
        for j in range(6):
            d[5 - j] = v % 64
            v //= 64
        s = "".join(chr(x + 48) for x in d)
        if hashlib.sha256((s + input_str).encode()).digest()[:2] == b"\x00\x00":
            return s
    raise RuntimeError("pow not solved in 2^22 tries")
