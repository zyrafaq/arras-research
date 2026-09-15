#!/usr/bin/env python3

import logging

FORMAT = "%(levelname)s %(message)s"


def setup_logging(level_name="info"):
    level = getattr(logging, str(level_name).upper(), logging.INFO)
    if not isinstance(level, int):
        level = logging.INFO
    logging.basicConfig(level=level, format=FORMAT)
    return level
