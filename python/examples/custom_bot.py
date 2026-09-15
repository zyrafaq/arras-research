import sys

from arras.client import ArrasBot, setup_logging


class ExampleBot(ArrasBot):
    def _on_w(self, packet):
        print(f"welcome: player {packet.player_id}")
        super()._on_w(packet)

    def _on_G(self, packet):
        print(f"turnstile: site {packet.site_id}")
        super()._on_G(packet)

    def _on_F(self, packet):
        print(f"death: score {packet.score}")
        super()._on_F(packet)


def main():
    setup_logging("info")
    host = sys.argv[1] if len(sys.argv) > 1 else "host:8443/5002"
    ExampleBot(host, name="subclass-example").run()


if __name__ == "__main__":
    main()
