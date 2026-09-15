import base64
import struct
import unittest

from arras.token import PlayerToken, TokenFormatError


def make_token(user_id, expiry_micros):
    raw = (struct.pack("<Q", user_id) + b"\x00" * 8
           + struct.pack("<q", expiry_micros) + b"\x00" * 12)
    return base64.b64encode(raw).decode()

class PlayerTokenTest(unittest.TestCase):
    def test_decode_fields(self):
        token = PlayerToken.decode(
            make_token(123456789012345678, 1_700_000_000_000_000))
        self.assertEqual(token.user_id, 123456789012345678)
        self.assertEqual(
            int(token.expires_at.timestamp() * 1000), 1_700_000_000_000)

    def test_expired_flag(self):
        self.assertTrue(PlayerToken.decode(make_token(1, 1_000_000)).expired)

    def test_short_token_rejected(self):
        with self.assertRaises(TokenFormatError):
            PlayerToken.decode(base64.b64encode(b"nope").decode())

    def test_invalid_base64_rejected(self):
        with self.assertRaises(TokenFormatError):
            PlayerToken.decode("!!! not base64 !!!")

if __name__ == "__main__":
    unittest.main()
