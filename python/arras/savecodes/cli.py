import argparse
import json
import sys

from .parser import SaveCodeFormatError, format_savecode, parse, save_summary


def _read_code(arg):
    if arg == "-" or arg is None:
        return sys.stdin.read()
    return arg


def _format_human(save):
    lines = [
        f"checksum   : {save.checksum}",
        f"server     : {save.server_id}",
        f"mode       : {save.mode} ({save.mode_display or '?'})",
        f"tank       : {save.tank}",
        f"build      : {'/'.join(map(str, save.build))}",
        f"score      : {save.score}",
        f"reserved   : {':'.join(map(str, save.reserved))}",
        f"timestamp  : {save.timestamp} ({save.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')})",
        f"signature  : {save.signature[:6]}... (len {len(save.signature)}, kept opaque)",
    ]
    return "\n".join(lines)


def build_parser():
    parser = argparse.ArgumentParser(
        prog="arras.savecodes",
        description="Decode an arras.io save (score) code. Structural only: "
                    "checksum/signature are not cryptographically verified.")
    sub = parser.add_subparsers(dest="command", metavar="command")

    p = sub.add_parser("decode", help="decode a save code")
    p.add_argument("code", help="save code, or '-' to read it from stdin")
    p.add_argument("--json", action="store_true", help="print only the JSON")

    p = sub.add_parser("explain", help="alias for decode")
    p.add_argument("code", help="save code, or '-' to read it from stdin")
    p.add_argument("--json", action="store_true", help="print only the JSON")

    p = sub.add_parser("roundtrip", help="decode then re-encode a save code")
    p.add_argument("code", help="save code, or '-' to read it from stdin")
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 1

    try:
        if args.command in ("decode", "explain"):
            save = parse(_read_code(args.code))
            if args.json:
                print(json.dumps(save.as_dict(), indent=2))
            else:
                print(f"Summary: {save_summary(save)}\n")
                print(_format_human(save))
        elif args.command == "roundtrip":
            save = parse(_read_code(args.code))
            again = format_savecode(save.as_dict())
            print(f"re-encoded: {again}")
            print(f"match:      {parse(again).as_dict() == save.as_dict()}")
    except SaveCodeFormatError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
