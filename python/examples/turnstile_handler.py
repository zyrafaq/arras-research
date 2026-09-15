import sys

from arras.client import run_session, setup_logging


def solve_turnstile(site_id, session_token):
    print(f"turnstile challenge: site={site_id} session={session_token}")
    return None


def main():
    setup_logging("info")
    host = sys.argv[1] if len(sys.argv) > 1 else "host:8443/5002"
    run_session(host, name="turnstile-example",
                turnstile_handler=solve_turnstile)


if __name__ == "__main__":
    main()
