import argparse
import json
import sys

from .player import PlayerToken, TokenFormatError

def _format_human(token):
    stamp = token.expires_at.strftime("%Y-%m-%d %H:%M:%S %Z")
    return "\n".join([
        f"discord id : {token.user_id}",
        f"expires    : {stamp}",
        f"status     : {'expired' if token.expired else 'valid'}",
    ])

def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="arras.token",
        description="Decode an arras.io player token (base64).")
    parser.add_argument("token", nargs="?",
                        help="token string, or '-' to read it from stdin")
    parser.add_argument("--json", action="store_true", help="print JSON")
    args = parser.parse_args(argv)

    text = args.token
    if text is None:
        parser.error("a token is required (or '-' to read it from stdin)")
    if text == "-":
        text = sys.stdin.read()

    try:
        token = PlayerToken.decode(text)
    except TokenFormatError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(token.as_dict(), indent=2))
    else:
        print(_format_human(token))
    return 0
