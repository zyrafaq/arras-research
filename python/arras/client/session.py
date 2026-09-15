import threading
import time

from .bot import ArrasBot
from .config import RECONNECT_DELAY, STOP, log

DEFAULT_UPGRADES = (3, 1, 1)
DEFAULT_SKILLS = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0)


def run_session(host, *, name="", bot_id=1, timeout=0,
                upgrades=DEFAULT_UPGRADES, skills=DEFAULT_SKILLS,
                party_id="", control=None, bot_type="multibox",
                autospin=False, dump_eval="", turnstile_handler=None,
                reconnect=True):
    bot = None
    while not STOP.is_set():
        bot = ArrasBot(host, name=name, timeout=timeout, party_id=party_id,
                       upgrades=upgrades, skills=skills, control=control,
                       bot_type=bot_type, autospin=autospin, bot_id=bot_id,
                       dump_eval=dump_eval,
                       turnstile_handler=turnstile_handler)
        bot.run()
        if STOP.is_set() or bot.timed_out or not reconnect:
            return bot
        if bot.welcome_event.is_set():
            log.info(f"== bot {bot_id}: disconnected after welcome, "
                     f"reconnecting in {RECONNECT_DELAY}s")
        else:
            log.info(f"== bot {bot_id}: never reached the game, "
                     f"retrying in {RECONNECT_DELAY}s")
        time.sleep(RECONNECT_DELAY)
    return bot


def run_bots(host, count=1, *, block=True, **kwargs):
    threads = []
    for i in range(count):
        thread = threading.Thread(
            target=run_session, name=f"bot-{i + 1}", daemon=True,
            kwargs={**kwargs, "host": host, "bot_id": i + 1})
        threads.append(thread)
        thread.start()
    if block:
        try:
            for thread in threads:
                while thread.is_alive() and not STOP.is_set():
                    thread.join(0.5)
        except KeyboardInterrupt:
            STOP.set()
    return threads
