import sys

from arras.client import (
    fetch_status,
    install_sigint_handler,
    normalize_status,
    resolve_server,
    run_session,
    setup_logging,
)


def pick_host(spec):
    servers = None
    try:
        servers, url = fetch_status()
        print(f"status: {len(servers)} servers from {url}")
    except ConnectionError as exc:
        print(f"status unavailable: {exc}")
    if spec:
        return resolve_server(spec, servers)
    if servers:
        return normalize_status(servers)[0]["host"]
    return input("host: ").strip()


def main():
    spec = sys.argv[1] if len(sys.argv) > 1 else ""
    setup_logging("info")
    install_sigint_handler()

    host = pick_host(spec)
    print(f"connecting to {host}")
    run_session(host, name="library-example")


if __name__ == "__main__":
    main()
