import argparse
import json
import os
import sys

from .converter import (
    COLOR_NAMES, decode, encode_v1, from_json_dict, int_to_rgb, theme_summary,
    to_json_dict,
)


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


def build_parser():
    parser = argparse.ArgumentParser(
        prog='arras.theme',
        description='arras.io theme code converter.')
    sub = parser.add_subparsers(dest='command', metavar='command')

    p = sub.add_parser('decode', aliases=['decrypt'],
                       help='decode a theme code to JSON')
    p.add_argument('code', help='theme code (arras/...) or raw base64')

    p = sub.add_parser('encode', help='encode theme JSON to a v1 code')
    p.add_argument('input', help='JSON string or path to a JSON file')
    p.add_argument('--name', help='override the theme name')
    p.add_argument('--author', help='override the author')
    p.add_argument('--blend', type=float, help='border blend, 0..1')
    p.add_argument('--neon', action='store_true', help='enable neon')

    p = sub.add_parser('roundtrip', help='decode then re-encode a theme code')
    p.add_argument('code', help='theme code (arras/...) or raw base64')

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 1

    try:
        if args.command in ('decode', 'decrypt'):
            cmd_decode(args.code)
        elif args.command == 'encode':
            cmd_encode(args.input, name=args.name, author=args.author,
                       blend=args.blend, neon=args.neon)
        elif args.command == 'roundtrip':
            cmd_roundtrip(args.code)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
