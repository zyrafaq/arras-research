import math

from ..codec import Cursor, _b, _s, _u
from .base import ServerPacket


class WelcomePacket(ServerPacket):
    TAG = "w"

    def __init__(self, player_id):
        self.player_id = player_id

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]) if fields[0][0] == "s" else "")

class KeyPacket(ServerPacket):
    TAG = "k"

    def __init__(self, player_token):
        self.player_token = player_token

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]) if fields and fields[0][0] == "s" else "")

class TravelPacket(ServerPacket):
    TAG = "r"

    def __init__(self, server, travel_token):
        self.server = server
        self.travel_token = travel_token

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]), _u(fields[1]))

class PingRequestPacket(ServerPacket):
    TAG = "p"

    @classmethod
    def parse(cls, fields):
        return cls()

class PowChallengePacket(ServerPacket):
    TAG = "C"

    def __init__(self, input_str):
        self.input = input_str

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]))

class EvalChallengePacket(ServerPacket):
    TAG = "e"

    def __init__(self, id_str, code):
        self.id = id_str
        self.code = code

    @classmethod
    def parse(cls, fields):
        strings = [f[1] for f in fields if f[0] == "s"]
        return cls(strings[0], strings[1] if len(strings) > 1 else "")

class RoomPacket(ServerPacket):
    TAG = "R"

    def __init__(self, info, room_x1, room_y1, room_x2, room_y2, tiles):
        self.info = info
        self.room_x1 = room_x1
        self.room_y1 = room_y1
        self.room_x2 = room_x2
        self.room_y2 = room_y2
        self.tiles = tiles

    @classmethod
    def parse(cls, fields):
        c = Cursor(fields)
        info = dict(
            part.split("=", 1) for part in c.string().split(",") if "=" in part
        )
        x1, y1, x2, y2 = c.signed(), c.signed(), c.signed(), c.signed()
        c.string()
        w, h = c.unsigned(), c.unsigned()
        tiles = [[c.signed() for _ in range(w)] for _ in range(h)]
        return cls(info, x1, y1, x2, y2, tiles)

class PlayerListPacket(ServerPacket):
    TAG = "P"

    def __init__(self, removed, changed):
        self.removed = removed
        self.changed = changed

    @classmethod
    def parse(cls, fields):
        c = Cursor(fields)
        removed = [{"socket_id": c.unsigned()} for _ in range(c.unsigned())]
        changed = []
        for _ in range(c.unsigned()):
            socket_id = c.unsigned()
            flag = c.unsigned()
            changed.append({
                "socket_id": socket_id,
                "self": bool(flag & 1),
                "operator_level": (flag - 1 if flag & 1 else flag) / 2,
                "name": c.string(),
                "mockup_index": c.signed(),
            })
        return cls(removed, changed)

class ServerMessagePacket(ServerPacket):
    TAG = "m"

    def __init__(self, message):
        self.message = message

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]))

class MockupsPacket(ServerPacket):
    TAG = "J"

    def __init__(self, mockups):
        self.mockups = mockups

    @classmethod
    def parse(cls, fields):
        c = Cursor(fields)
        mockups = []
        for _ in range(c.unsigned()):
            m = {"mockup_index": c.unsigned()}
            m["name"] = c.string()
            m["score_text"] = c.string()
            m["color"] = c.signed()
            shape = c.signed()
            if shape == 0x800:
                shape = [[c.signed(), c.signed()] for _ in range(c.unsigned())]
            m["shape"] = shape
            m["entity_type"] = c.unsigned()
            m["shoots_type"] = c.unsigned()
            m["offset"] = c.signed()
            m["size"] = c.signed()
            m["upgrades"] = [
                {"tier": c.unsigned(), "mockup_index": c.unsigned()}
                for _ in range(c.unsigned())
            ]
            m["guns"] = [
                {
                    "x": c.signed(), "y": c.signed(),
                    "length": c.signed(), "width": c.signed(),
                    "aspect": c.signed(), "angle": c.signed(),
                }
                for _ in range(c.unsigned())
            ]
            m["turrets"] = [
                {
                    "mockup_index": c.unsigned(), "scale": c.signed(),
                    "offset": c.signed(), "direction": c.signed(),
                    "render_on_top": c.boolean(), "angle": c.signed(),
                }
                for _ in range(c.unsigned())
            ]
            mockups.append(m)
        return cls(mockups)

class UpdatePacket(ServerPacket):
    TAG = "u"

    def __init__(self, body_x, body_y, body_fov, update_flags, body,
                 dead, removed, changed):
        self.body_x = body_x
        self.body_y = body_y
        self.body_fov = body_fov
        self.update_flags = update_flags
        self.body = body
        self.dead = dead
        self.removed = removed
        self.changed = changed

    @classmethod
    def parse(cls, fields):
        c = Cursor(fields)
        out = {
            "body_x": c.signed(),
            "body_y": c.signed(),
            "body_fov": c.unsigned(),
            "dead": [],
            "removed": [],
            "changed": [],
        }
        update_flags = c.unsigned()
        if update_flags & (1 << 0):
            out["mspt"] = c.unsigned()
        if update_flags & (1 << 1):
            out["speed"] = c.unsigned()
        if update_flags & (1 << 2):
            out["mockup_index"] = c.unsigned()
            c.signed()
        if update_flags & (1 << 3):
            out["color"] = c.signed()
            out["id"] = c.unsigned()
        if update_flags & (1 << 4):
            out["score"] = c.unsigned()
        if update_flags & (1 << 5):
            out["kills"] = {
                "player": c.unsigned(), "assist": c.unsigned(),
                "boss": c.unsigned(), "food": c.unsigned(),
            }
        if update_flags & (1 << 6):
            out["skill_points"] = c.unsigned()
        if update_flags & (1 << 7):
            out["max_skills"] = [c.unsigned() for _ in range(10)]
        if update_flags & (1 << 8):
            out["skills"] = [c.unsigned() for _ in range(10)]
        if update_flags & (1 << 9):
            out["upgrades"] = [c.unsigned() for _ in range(c.unsigned())]
        if update_flags & (1 << 10):
            out["party_code"] = c.string()
        if update_flags & (1 << 11):
            out["operator_level"] = c.unsigned()

        while c.peek_signed() != -1:
            out["dead"].append({"id": c.unsigned()})
        c.unsigned()
        while c.peek_signed() != -1:
            out["removed"].append({"id": c.unsigned()})
        c.unsigned()

        changed = []
        while c.remaining() > 1:
            entity_id = c.unsigned()
            entity = cls._parse_entity(c)
            entity["id"] = entity_id
            changed.append(entity)
        out["changed"] = changed

        body = out
        return cls(out["body_x"], out["body_y"], out["body_fov"],
                   update_flags, body, out["dead"], out["removed"], changed)

    @staticmethod
    def _parse_entity(c):
        entity = {}
        entity_flags = c.unsigned()
        if entity_flags & (1 << 0):
            entity["delta_x"] = c.signed() / 4
            entity["delta_y"] = c.signed() / 4
        if entity_flags & (1 << 1):
            entity["delta_facing"] = c.signed() * math.pi / 512
        if entity_flags & (1 << 2):
            entity["mockup_index"] = c.unsigned()
        if entity_flags & (1 << 3):
            entity["guns"] = {}
            while c.peek_signed() != -1:
                gun_index = c.unsigned()
                gun_flags = c.unsigned()
                gun = {}
                if gun_flags & (1 << 0):
                    gun["time"] = c.unsigned()
                if gun_flags & (1 << 1):
                    gun["power"] = c.unsigned()
                entity["guns"][gun_index] = gun
            c.unsigned()
        if entity_flags & (1 << 4):
            entity["turrets"] = {}
            while c.peek_signed() != -1:
                turret_index = c.unsigned()
                entity["turrets"][turret_index] = UpdatePacket._parse_entity(c)
            c.unsigned()
        if entity_flags & (1 << 5):
            data_flags = c.unsigned()
            entity["auto_spin"] = bool(data_flags & (1 << 0))
            entity["reverse_tank"] = bool(data_flags & (1 << 1))
            entity["invuln"] = bool(data_flags & (1 << 3))
            entity["damage"] = bool(data_flags & (1 << 4))
        if entity_flags & (1 << 6):
            entity["health"] = c.unsigned() / 255
        if entity_flags & (1 << 7):
            entity["shield"] = c.unsigned() / 255
        if entity_flags & (1 << 8):
            entity["alpha"] = c.unsigned() / 255
        if entity_flags & (1 << 9):
            entity["size"] = c.unsigned() * 0.0625
        if entity_flags & (1 << 10):
            entity["score"] = c.unsigned()
        if entity_flags & (1 << 11):
            entity["name"] = c.string()
        if entity_flags & (1 << 12):
            entity["color"] = c.signed()
        if entity_flags & (1 << 13):
            entity["layer"] = c.signed()
        return entity

class BroadcastPacket(ServerPacket):
    TAG = "b"

    def __init__(self, minimap_removed, minimap_changed,
                 team_minimap_removed, team_minimap_changed,
                 leaderboard_removed, leaderboard_changed):
        self.minimap_removed = minimap_removed
        self.minimap_changed = minimap_changed
        self.team_minimap_removed = team_minimap_removed
        self.team_minimap_changed = team_minimap_changed
        self.leaderboard_removed = leaderboard_removed
        self.leaderboard_changed = leaderboard_changed

    @classmethod
    def parse(cls, fields):
        c = Cursor(fields)

        def list_length():
            n = c.signed()
            return -1 if n == -1 else c.fields[c.i - 1][1]

        minimap_removed = [{"id": c.unsigned()} for _ in range(list_length())]
        minimap_changed = [
            {
                "id": c.unsigned(), "type": c.unsigned(),
                "x": c.signed() / 255, "y": c.signed() / 255,
                "color": c.signed(), "size": c.unsigned(),
            }
            for _ in range(list_length())
        ]
        team_minimap_removed = [{"id": c.unsigned()} for _ in range(list_length())]
        team_minimap_changed = [
            {
                "id": c.unsigned(),
                "x": c.signed() / 255, "y": c.signed() / 255,
                "color": c.signed(),
            }
            for _ in range(list_length())
        ]
        leaderboard_removed = [{"id": c.unsigned()} for _ in range(list_length())]
        leaderboard_changed = [
            {
                "id": c.unsigned(), "score": c.unsigned(),
                "mockup_index": c.unsigned(), "name": c.string(),
                "color": c.signed(), "bar_color": c.signed(),
            }
            for _ in range(list_length())
        ]
        return cls(minimap_removed, minimap_changed,
                   team_minimap_removed, team_minimap_changed,
                   leaderboard_removed, leaderboard_changed)

class CameraPacket(ServerPacket):
    TAG = "c"

    def __init__(self, body_x, body_y, body_fov):
        self.body_x = body_x
        self.body_y = body_y
        self.body_fov = body_fov

    @classmethod
    def parse(cls, fields):
        return cls(_s(fields[0]), _s(fields[1]), _u(fields[2]))

class ChatPacket(ServerPacket):
    TAG = "M"

    def __init__(self, entity_id, message, is_global):
        self.entity_id = entity_id
        self.message = message
        self.is_global = is_global

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]), _u(fields[1]), _b(fields[2]))

class KickPacket(ServerPacket):
    TAG = "K"

    def __init__(self, reason):
        self.reason = reason

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]) if fields and fields[0][0] == "s" else "")

class DeathPacket(ServerPacket):
    TAG = "F"

    def __init__(self, time, score, time_alive, kills, kill_info,
                 killers, death_type, server_activity, servers_traveled,
                 respawn_time, save_code):
        self.time = time
        self.score = score
        self.time_alive = time_alive
        self.kills = kills
        self.kill_info = kill_info
        self.killers = killers
        self.death_type = death_type
        self.server_activity = server_activity
        self.servers_traveled = servers_traveled
        self.respawn_time = respawn_time
        self.save_code = save_code

    @classmethod
    def parse(cls, fields):
        c = Cursor(fields)
        time = c.unsigned()
        score = c.unsigned()
        time_alive = c.unsigned()
        kills = {
            "player": c.unsigned(), "assist": c.unsigned(),
            "boss": c.unsigned(), "food": c.unsigned(),
        }
        kill_type = c.unsigned()
        kill_info = {}
        if kill_type == 1:
            kill_info["amount"] = c.signed()
        elif kill_type == 2:
            kill_info["amount"] = c.signed()
            kill_info["name"] = c.string()
        death_type = c.unsigned()
        killers = []
        if death_type == 0:
            for _ in range(c.unsigned()):
                killers.append({"name": c.string(), "tank": c.string()})
        return cls(
            time, score, time_alive, kills,
            {"type": ["none", "food", "player"][kill_type], **kill_info},
            killers,
            ["killed", "dumb_death", "self_destruct",
             "surrender_control", "save_score"][death_type],
            c.unsigned(), c.unsigned(), c.unsigned() + 2000, c.string(),
        )

class TurnstileChallengePacket(ServerPacket):
    TAG = "G"

    def __init__(self, session_token, site_id):
        self.session_token = session_token
        self.site_id = site_id

    @classmethod
    def parse(cls, fields):
        return cls(_u(fields[0]), _u(fields[1]))
