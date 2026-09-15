import logging
import os
import signal
import threading

BUILD = os.environ.get("ARRAS_BUILD", "fc3fa85eb58aebd0")
PROTOCOLS = ["arras.io#v1.4+sls+et0", "arras.io"]
BROWSER_UA = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0"
CHECK_KICK_GRACE = 2.0
RECONNECT_DELAY = 1

STOP = threading.Event()

log = logging.getLogger("arras")

_bot_id_local = threading.local()


class _BotIdLogFilter(logging.Filter):
    def filter(self, record):
        bot_id = getattr(_bot_id_local, "bot_id", None)
        if bot_id is not None:
            record.msg = f"[bot {bot_id}] {record.msg}"
        return True

log.addFilter(_BotIdLogFilter())


def install_sigint_handler():
    def _on_sigint(signum, frame):
        STOP.set()
        os._exit(0)

    signal.signal(signal.SIGINT, _on_sigint)
