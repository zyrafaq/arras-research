import unittest

from arras.protocol import decode_packet, encode_packet
from arras.protocol.packets import (
    PingResponsePacket,
    SpawnRequestPacket,
    CommandPacket,
)
from arras.modes import format_mode


class CodecTest(unittest.TestCase):
    def test_ping_roundtrip(self):
        raw = encode_packet(PingResponsePacket.build())
        self.assertEqual(decode_packet(raw)[0], "p")

    def test_spawn_flags(self):
        raw = encode_packet(SpawnRequestPacket.build(
            "bob", "ABC", auto_level_up=True, incognito=True))
        fields = decode_packet(raw)
        self.assertEqual(fields[0], "s")
        self.assertIn(("s", "bob"), fields)
        self.assertIn(("s", "ABC"), fields)

    def test_command_action_bits(self):
        raw = encode_packet(CommandPacket.build(1, 2, up=True, lmb=True))
        fields = decode_packet(raw)
        self.assertEqual(fields[0], "C")

    def test_negative_number_roundtrip(self):
        raw = encode_packet(["x", ("i", -500)])
        self.assertEqual(decode_packet(raw)[1][2], -500)

class ModesTest(unittest.TestCase):
    def test_ffa(self):
        self.assertEqual(format_mode("f"), "FFA")

    def test_modifier_and_win(self):
        self.assertEqual(format_mode("gafd"), "Growth Arms Race FFA Domination")

    def test_empty(self):
        self.assertIsNone(format_mode(""))

if __name__ == "__main__":
    unittest.main()
