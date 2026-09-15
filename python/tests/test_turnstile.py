import unittest

from arras.client import ArrasBot
from arras.protocol import (
    SERVER_PACKETS,
    TurnstileAnswerPacket,
    TurnstileChallengePacket,
    decode_packet,
    encode_packet,
)


class TurnstilePacketTest(unittest.TestCase):

    def test_challenge_registered(self):
        self.assertIs(SERVER_PACKETS["G"], TurnstileChallengePacket)

    def test_challenge_parse(self):
        packet = TurnstileChallengePacket.parse([("s", "sess"), ("s", "site")])
        self.assertEqual(packet.session_token, "sess")
        self.assertEqual(packet.site_id, "site")

    def test_answer_wire(self):
        wire = encode_packet(TurnstileAnswerPacket.build("sess", "tok"))
        self.assertEqual(
            decode_packet(wire), ["G", ("s", "sess"), ("s", "tok"), ("s", "")])


class TurnstileHandlerTest(unittest.TestCase):

    def _bot(self, handler):
        bot = ArrasBot("host:1")
        bot.turnstile_handler = handler
        sent = []
        bot.send = lambda packet, label="": sent.append(packet)
        return bot, sent

    def test_handler_token_is_sent(self):
        bot, sent = self._bot(lambda site, session: "tok")
        bot.answer_turnstile("site", "sess")
        self.assertEqual(sent, [["G", "sess", "tok", ""]])

    def test_missing_handler_sends_nothing(self):
        bot, sent = self._bot(None)
        bot.answer_turnstile("site", "sess")
        self.assertEqual(sent, [])

    def test_falsy_token_sends_nothing(self):
        bot, sent = self._bot(lambda site, session: None)
        bot.answer_turnstile("site", "sess")
        self.assertEqual(sent, [])


if __name__ == "__main__":
    unittest.main()
