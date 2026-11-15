import base64
import binascii
import struct
from dataclasses import dataclass
from datetime import datetime, timezone

_ID_OFFSET = 0
_NONCE_OFFSET = 8
_EXPIRY_OFFSET = 16
_TAG_OFFSET = 24
_MIN_BYTES = _EXPIRY_OFFSET + 8
_FULL_BYTES = _TAG_OFFSET + 12
_MICROS_PER_SECOND = 1_000_000

class TokenFormatError(ValueError):
    pass

def _decode_base64(text):
    cleaned = "".join(text.split())
    if not cleaned:
        raise TokenFormatError("empty token")
    cleaned = cleaned.replace("-", "+").replace("_", "/")
    padded = cleaned + "=" * (-len(cleaned) % 4)
    try:
        return base64.b64decode(padded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise TokenFormatError("not valid base64") from exc

@dataclass(frozen=True)
class PlayerToken:
    user_id: int
    expires_at: datetime
    nonce: str = ""
    tag: str = ""

    @property
    def expired(self):
        return datetime.now(timezone.utc) >= self.expires_at

    def as_dict(self):
        info = {
            "user_id": str(self.user_id),
            "expires_at": self.expires_at.isoformat(),
            "expired": self.expired,
        }
        if self.nonce:
            info["nonce"] = self.nonce
        if self.tag:
            info["tag"] = self.tag
        return info

    @classmethod
    def decode(cls, token):
        raw = _decode_base64(token)
        if len(raw) < _MIN_BYTES:
            raise TokenFormatError(
                f"token is {len(raw)} bytes, need at least {_MIN_BYTES}")
        user_id = struct.unpack_from("<Q", raw, _ID_OFFSET)[0]
        expiry_micros = struct.unpack_from("<q", raw, _EXPIRY_OFFSET)[0]
        try:
            expires_at = datetime.fromtimestamp(
                expiry_micros / _MICROS_PER_SECOND, tz=timezone.utc)
        except (OverflowError, OSError, ValueError) as exc:
            raise TokenFormatError("expiry field is out of range") from exc
        nonce = raw[_NONCE_OFFSET:_EXPIRY_OFFSET].hex()
        tag = raw[_TAG_OFFSET:_FULL_BYTES].hex() if len(raw) >= _FULL_BYTES else ""
        return cls(user_id, expires_at, nonce, tag)
