from __future__ import annotations

import argparse
import json
import os
import sys

from .local_storage import ArrasLocalStorage


def _read_code(arg: str | None) -> str:
    if arg is None or arg == "-":
        return sys.stdin.read().strip()
    return arg.strip()


def _read_json_input(arg: str | None) -> dict:
    if arg is None or arg == "-":
        text = sys.stdin.read()
    elif os.path.isfile(arg):
        with open(arg, encoding="utf-8") as f:
            text = f.read()
    else:
        text = arg
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("settings JSON must be an object")
    return data


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="arras.localstorage",
        description="Encode/decode the encrypted arras.io localStorage blob.",
    )
    sub = parser.add_subparsers(dest="command", metavar="command")

    p = sub.add_parser("decode", help="decode a blob to nested JSON")
    p.add_argument("code", nargs="?", help="blob string, or '-' / omit to read stdin")

    p = sub.add_parser("flat", help='decode a blob to flat "a.b.c" JSON')
    p.add_argument("code", nargs="?", help="blob string, or '-' / omit to read stdin")

    p = sub.add_parser("encode", help="encode settings JSON to a blob")
    p.add_argument("input", nargs="?", help="JSON string, path to a JSON file, or '-' / omit to read stdin")

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 1

    try:
        ls = ArrasLocalStorage()
        if args.command == "decode":
            print(json.dumps(ls.decode(_read_code(args.code)), indent=2))
        elif args.command == "flat":
            print(json.dumps(ls.decode_flat(_read_code(args.code)), indent=2))
        elif args.command == "encode":
            print(ls.encode(_read_json_input(args.input)))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
