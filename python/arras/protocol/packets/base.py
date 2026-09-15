class ServerPacket:
    TAG = "?"

    @classmethod
    def parse(cls, fields):
        raise NotImplementedError

class ClientPacket:
    TAG = "?"
