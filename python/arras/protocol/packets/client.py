import json

from .base import ClientPacket


class KeyRequestPacket(ClientPacket):
    TAG = "k"

    @staticmethod
    def build(player_id="", player_token="", travel_token=""):
        return ["k", player_id, player_token, travel_token]

class TrackingPacket(ClientPacket):
    TAG = "T"

    @staticmethod
    def build(data):
        return ["T", json.dumps(data)]

class PingResponsePacket(ClientPacket):
    TAG = "p"

    @staticmethod
    def build():
        return ["p"]

class SpawnRequestPacket(ClientPacket):
    TAG = "s"

    @staticmethod
    def build(name="", party_id="", auto_level_up=True, incognito=False):
        return ["s", name, party_id,
                int(bool(auto_level_up)) | (int(bool(incognito)) << 1)]

class EvalAnswerPacket(ClientPacket):
    TAG = "e"

    @staticmethod
    def build(id_str, result):
        return ["e", id_str, result]

class PowAnswerPacket(ClientPacket):
    TAG = "R"

    @staticmethod
    def build(input_str, result):
        return ["R", input_str, result]

class TankUpgradePacket(ClientPacket):
    TAG = "U"

    @staticmethod
    def build(index):
        return ["U", ("u", index)]

class SkillUpgradePacket(ClientPacket):
    TAG = "x"

    @staticmethod
    def build(index, type_="add", value=None):
        if type_ == "add":
            return ["x", ("u", index), ("i", -1)]
        if type_ == "max":
            return ["x", ("u", index), ("i", 255)]
        return ["x", ("u", index), ("i", value)]

class CommandPacket(ClientPacket):
    TAG = "C"

    @staticmethod
    def build(x, y, up=False, down=False, left=False, right=False,
              lmb=False, rmb=False):
        action = (int(bool(up)) | (int(bool(down)) << 1) |
                  (int(bool(left)) << 2) | (int(bool(right)) << 3) |
                  (int(bool(lmb)) << 4) | (int(bool(rmb)) << 6))
        return ["C", ("i", x), ("i", y), ("u", action)]

class TogglePacket(ClientPacket):
    TAG = "t"

    TOGGLES = ["autofire", "autospin", "override", "reverse"]

    @staticmethod
    def build(action):
        return ["t", ("u", TogglePacket.TOGGLES.index(action))]

class LevelUpCheatPacket(ClientPacket):
    TAG = "L"

    @staticmethod
    def build():
        return ["L"]

class KeyPressPacket(ClientPacket):
    TAG = "0"

    @staticmethod
    def build(key_code, is_key_down):
        return ["0", key_code, ("u", int(bool(is_key_down)))]

class ChatMessagePacket(ClientPacket):
    TAG = "M"

    @staticmethod
    def build(message):
        return ["M", message]

class PlayerActionPacket(ClientPacket):
    TAG = "P"

    ACTIONS = ["promote", "demote", "kick"]

    @staticmethod
    def build(action, player_id):
        return ["P", ("u", PlayerActionPacket.ACTIONS.index(action)),
                ("u", player_id)]

class SuicidePacket(ClientPacket):
    TAG = "K"

    @staticmethod
    def build():
        return ["K"]

class AbilityPacket(ClientPacket):
    TAG = "A"

    @staticmethod
    def build():
        return ["A"]

class SaveScorePacket(ClientPacket):
    TAG = "D"

    @staticmethod
    def build():
        return ["D"]

class TurnstileAnswerPacket(ClientPacket):
    TAG = "G"

    @staticmethod
    def build(session_token, turnstile_token):
        return ["G", session_token, turnstile_token, ""]
