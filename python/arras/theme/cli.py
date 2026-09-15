import json
import os
import sys

from .converter import (
    COLOR_NAMES, decode, encode_v1, from_json_dict, int_to_rgb, theme_summary,
    to_json_dict,
)

USAGE = """\
arras.io theme converter

Usage:
  python3 -m arras.theme decode <theme_code>
  python3 -m arras.theme encode <json_or_file> [--name N] [--author A] [--blend B] [--neon]
  python3 -m arras.theme roundtrip <theme_code>
"""

def print_color_table(theme):
    table = theme['table']
    for i, c in enumerate(table):
        name = COLOR_NAMES[i] if i < len(COLOR_NAMES) else f'idx_{i}'
        r, g, b = int_to_rgb(c)
        print(f'  [{i:2d}] {name:10s} = #{r:02x}{g:02x}{b:02x}  ({c})')

def cmd_decode(code):
    theme, fmt = decode(code)
    print(f'Format: {fmt}')
    print(f'Summary: {theme_summary(theme)}')
    print()
    print_color_table(theme)
    print()
    print('JSON:')
    print(json.dumps(to_json_dict(theme), indent=2))

def cmd_encode(json_input, name=None, author=None, blend=None, neon=False):
    if os.path.isfile(json_input):
        with open(json_input) as f:
            d = json.load(f)
    else:
        d = json.loads(json_input)

    if name is not None:
        d['name'] = name
    if author is not None:
        d['author'] = author
    if blend is not None:
        d['border'] = float(blend)

    theme = from_json_dict(d)
    if neon:
        theme['neon'] = True

    code = encode_v1(theme)
    print(code)
    print()
    print(f'Summary: {theme_summary(theme)}')

def cmd_roundtrip(code):
    theme1, fmt = decode(code)
    code2 = encode_v1(theme1)
    theme2, _ = decode(code2)

    print(f'Original:  {code}')
    print(f'Re-encoded: {code2}')
    print()
    print(f'Match: {theme1["table"] == theme2["table"] and theme1["blend"] == theme2["blend"]}')
    print()
    print_color_table(theme2)

def main():
    if len(sys.argv) < 2:
        print(USAGE.strip())
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'decode':
        if len(sys.argv) < 3:
            print('Usage: python3 -m arras.theme decode <theme_code>')
            sys.exit(1)
        cmd_decode(sys.argv[2])

    elif cmd == 'encode':
        if len(sys.argv) < 3:
            print('Usage: python3 -m arras.theme encode <json_or_file> [--name N] [--author A] [--blend B] [--neon]')
            sys.exit(1)
        json_input = sys.argv[2]
        name = author = blend = None
        neon = False
        i = 3
        while i < len(sys.argv):
            if sys.argv[i] == '--name' and i + 1 < len(sys.argv):
                name = sys.argv[i + 1]; i += 2
            elif sys.argv[i] == '--author' and i + 1 < len(sys.argv):
                author = sys.argv[i + 1]; i += 2
            elif sys.argv[i] == '--blend' and i + 1 < len(sys.argv):
                blend = sys.argv[i + 1]; i += 2
            elif sys.argv[i] == '--neon':
                neon = True; i += 1
            else:
                i += 1
        cmd_encode(json_input, name=name, author=author, blend=blend, neon=neon)

    elif cmd == 'roundtrip':
        if len(sys.argv) < 3:
            print('Usage: python3 -m arras.theme roundtrip <theme_code>')
            sys.exit(1)
        cmd_roundtrip(sys.argv[2])

    else:
        print(f'Unknown command: {cmd}')
        print(USAGE.strip())
        sys.exit(1)
