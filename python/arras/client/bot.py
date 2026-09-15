import math
import secrets
import socket
import struct
import threading
import time

from ..localstorage import ArrasLocalStorage
from ..protocol.crypto import ArrasCipher, x25519, x25519_base
from ..protocol import (
    decode_packet,
    encode_packet,
    SERVER_PACKETS,
    KeyRequestPacket,
    PingResponsePacket,
    SpawnRequestPacket,
    EvalAnswerPacket,
    PowAnswerPacket,
    TankUpgradePacket,
    SkillUpgradePacket,
    CommandPacket,
    TogglePacket,
    LevelUpCheatPacket,
    KeyPressPacket,
    ChatMessagePacket,
    PlayerActionPacket,
    SuicidePacket,
    AbilityPacket,
    SaveScorePacket,
    TurnstileAnswerPacket,
)

from .config import BUILD, CHECK_KICK_GRACE, log, _bot_id_local
from .eval import eval_js, eval_math, pow_solve
from .websocket import WSClient


class ArrasBot:
    def __init__(self, host, name="", timeout=0, auto_level_up=True,
                 party_id="", incognito=False,
                 upgrades=(3, 1, 1), skills=(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
                 control=None, bot_type="multibox",
                 autospin=False, bot_id=1,
                 stop_after_welcome=False, dump_eval="",
                 hold=False, turnstile_handler=None):
        ts = int(time.time())
        url = f"wss://{host}/?a=3&b={BUILD}&t={ts}"
        self.ws = WSClient(url)
        self.name = name
        self.party_id = party_id
        self.auto_level_up = auto_level_up
        self.incognito = incognito
        self.timeout = timeout
        self.upgrades = upgrades
        self.skills = skills
        self.control = control
        self.bot_type = bot_type
        self.autospin = autospin
        self.autofire_on = False
        self.cipher = None
        self.player_id = ""
        self.player_token = ""
        self.travel_token = ""
        self.bot_id = bot_id
        self._ls_blob = None
        self.stop_after_welcome = stop_after_welcome
        self.welcome_event = threading.Event()
        self.spawn_message_event = threading.Event()
        self.welcome_time = 0.0
        self.kicked = False
        self.timed_out = False
        self.dump_eval = dump_eval
        self.t0 = time.time()
        self.target = (0, 0)
        self.spawned = False
        self.body_x = 0.0
        self.body_y = 0.0
        self.entity_id = None
        self.entities = {}
        self.player_names = {}
        self.color = None
        self.party_code = ""
        self.found = threading.Event()
        self.hold = hold
        self.stop = threading.Event()
        self._last_nav_log = 0.0
        self._last_ctrl_target = None
        self._send_lock = threading.Lock()
        self._cmd_stop = threading.Event()
        self._cmd_thread = None
        self._commands_suppressed = False
        self.turnstile_handler = turnstile_handler

    def send(self, packet, label=""):
        data = encode_packet(packet)
        with self._send_lock:
            enc = self.cipher.encrypt(data)
            self.ws._send(2, enc)
        log.debug(f"  -> {label or packet[0]}: {data.hex()}")

    def ping(self):
        self.send(PingResponsePacket.build(), "ping")

    def _display_name(self):
        return self.name

    def spawn(self, party_id=None):
        self.send(SpawnRequestPacket.build(
            self.name,
            self.party_id if party_id is None else party_id,
            auto_level_up=self.auto_level_up,
            incognito=self.incognito,
        ), "spawn")

    def respawn(self):
        self.send(SpawnRequestPacket.build(
            self.name, self.party_id,
            auto_level_up=self.auto_level_up,
            incognito=self.incognito,
        ), "respawn")

    def _localstorage_blob(self):
        if self._ls_blob is None:
            settings: dict = {}
            if self.name:
                settings["name"] = self.name
            extra = {}
            if self.incognito:
                extra["incognito"] = True
            if not self.auto_level_up:
                extra["auto_max"] = False
            if extra:
                settings["extra"] = extra
            try:
                self._ls_blob = ArrasLocalStorage().encode(settings)
            except Exception as e:
                log.warning(f"== localStorage encode failed: {e}")
                self._ls_blob = ""
        return self._ls_blob

    def answer_eval(self, id_str, code):
        result = eval_js(code, self._localstorage_blob())
        if result is None:
            result = eval_math(code)
        if result is None:
            result = "0"
        if self.dump_eval:
            log.info(f"== eval result id={id_str!r}: {result!r}")
            try:
                with open(self.dump_eval, "a") as f:
                    f.write(f"=== eval result id={id_str!r} ===\n{result}\n\n")
            except OSError as e:
                log.warning(f"== cannot write eval dump {self.dump_eval!r}: {e}")
        self.send(EvalAnswerPacket.build(id_str, result), "eval-result")

    def answer_pow(self, input_str):
        t0 = time.time()
        sol = pow_solve(input_str)
        log.debug(f"   solved {sol!r} in {time.time() - t0:.2f}s")
        self.send(PowAnswerPacket.build(input_str, sol), "pow-result")

    def answer_turnstile(self, site_id, session_token):
        if self.turnstile_handler is None:
            log.warning(
                "== turnstile challenge received: the server requires a "
                "Cloudflare Turnstile token, so the bot cannot spawn. "
                "Provide a turnstile_handler when creating the bot; solving "
                "the captcha itself is out of scope for this repository")
            return
        try:
            token = self.turnstile_handler(site_id, session_token)
        except Exception as e:
            log.warning(f"== turnstile handler failed: {e}")
            return
        if not token:
            log.warning("== turnstile handler returned no token")
            return
        self.send(TurnstileAnswerPacket.build(session_token, token), "turnstile-answer")

    def upgrade_tank(self, index):
        self.send(TankUpgradePacket.build(index), "upgrade")

    def upgrade_skill(self, index, type_="add", value=None):
        self.send(SkillUpgradePacket.build(index, type_, value), "skill")

    def move(self, x, y, up=False, down=False, left=False, right=False,
             lmb=False, rmb=False):
        self.send(CommandPacket.build(x, y, up, down, left, right, lmb, rmb),
                  "command")

    def toggle(self, action):
        self.send(TogglePacket.build(action), "toggle")

    def level_up_cheat(self):
        self.send(LevelUpCheatPacket.build(), "level-up-cheat")

    def press_key(self, key_code, is_key_down):
        self.send(KeyPressPacket.build(key_code, is_key_down), "key")

    def send_message(self, message):
        self.send(ChatMessagePacket.build(message), "chat")

    def player_action(self, action, player_id):
        self.send(PlayerActionPacket.build(action, player_id), "player-action")

    def suicide(self):
        self.send(SuicidePacket.build(), "suicide")

    def ability(self):
        self.send(AbilityPacket.build(), "ability")

    def save_score(self):
        self.send(SaveScorePacket.build(), "save-score")

    def go_to(self, x, y):
        self.target = (x, y)
        if self._cmd_thread is None or not self._cmd_thread.is_alive():
            self._cmd_stop = threading.Event()
            self._cmd_thread = threading.Thread(
                target=self._command_loop, daemon=True)
            self._cmd_thread.start()

    def _send_command_tick(self):
        if self._commands_suppressed:
            return
        if self.control is not None:
            if self.control.has_state:
                self._send_control_tick()
            return
        dx = self.target[0] - self.body_x
        dy = self.target[1] - self.body_y
        dist = math.hypot(dx, dy)
        if dist < 5:
            return
        aim_x = int(round(dx))
        aim_y = int(round(dy))
        lmb = self.bot_type == "feed"
        self._steer(dx, dy, aim_x, aim_y, lmb=lmb)

    def _steer(self, dx, dy, aim_x, aim_y, lmb=False):
        sector = round(math.degrees(math.atan2(dy, dx)) / 45) % 8
        up = sector in (5, 6, 7)
        down = sector in (1, 2, 3)
        left = sector in (3, 4, 5)
        right = sector in (0, 1, 7)
        self.move(aim_x, aim_y, up=up, down=down, left=left,
                  right=right, lmb=lmb)

    def _send_control_tick(self):
        st = self.control.state
        cam, tgt, dire = st["camera"], st["target"], st["direction"]
        t = (tgt["x"], tgt["y"])
        if t != self._last_ctrl_target:
            self._last_ctrl_target = t
            log.info(f"== control target -> ({t[0]}, {t[1]})")
        self.target = t
        toggles = st.get("toggles", {})
        self.autofire_on = bool(toggles.get("autofire", False))
        lmb = bool(st.get("lmb", False)) or self.autofire_on
        if self.bot_type == "feed":
            dx = tgt["x"] - self.body_x
            dy = tgt["y"] - self.body_y
            self._steer(dx, dy, int(round(dx)), int(round(dy)), lmb=True)
        else:
            aim_pt = st.get("aim")
            if aim_pt:
                aim_x = int(round(aim_pt["x"]))
                aim_y = int(round(aim_pt["y"]))
            else:
                deg = st.get("degree", 0.0)
                aim_rad = math.radians(deg)
                aim_x = int(round(math.cos(aim_rad) * 100))
                aim_y = int(round(math.sin(aim_rad) * 100))
            dx = tgt["x"] - self.body_x
            dy = tgt["y"] - self.body_y
            dist = math.hypot(dx, dy)
            if dist < 5:
                dx, dy = dire["x"], dire["y"]
                if dx == 0 and dy == 0:
                    self._steer(0, 0, aim_x, aim_y, lmb=lmb)
                    return
            self._steer(dx, dy, aim_x, aim_y, lmb=lmb)

    def _command_loop(self):
        while not self._cmd_stop.is_set():
            if self.spawned:
                self._send_command_tick()
            self._cmd_stop.wait(0.1)

    def _heading_to_target(self):
        dx = self.target[0] - self.body_x
        dy = self.target[1] - self.body_y
        dist = math.hypot(dx, dy)
        heading = math.degrees(math.atan2(dy, dx)) if dist else 0.0
        return dist, heading

    def _log_navigation(self):
        now = time.time()
        if now - self._last_nav_log < 5:
            return
        self._last_nav_log = now
        dist, heading = self._heading_to_target()
        log.info(f"== nav: pos=({self.body_x:.1f},{self.body_y:.1f}) "
                 f"target=({self.target[0]},{self.target[1]}) "
                 f"dist={dist:.1f} heading={heading:.1f}deg")

    def handle(self, tag, fields):
        cls = SERVER_PACKETS.get(tag)
        if cls is None:
            summary = ", ".join(
                (f"{v!r}" if k == "s" else str(v))
                for k, v, *_ in fields[:12])
            log.warning(f"== unknown packet {tag!r}: {summary}")
            return
        packet = cls.parse(fields)
        handler = getattr(self, "_on_" + tag, self._on_default)
        handler(packet)

    def _on_default(self, packet):
        log.debug(f"== {packet.__class__.__name__} (tag {packet.TAG})")

    def _on_w(self, packet):
        self.player_id = packet.player_id
        self.welcome_event.set()
        self.welcome_time = time.time()
        log.info(f"== welcome to the game! playerId={self.player_id!r}")
        self.spawn()
        self.ping()

    def _on_p(self, packet):
        self.ping()

    def _on_e(self, packet):
        if self.dump_eval:
            log.info(f"== eval packet id={packet.id!r}:\n{packet.code}")
            try:
                with open(self.dump_eval, "a") as f:
                    f.write(f"=== eval packet id={packet.id!r} ===\n"
                            f"{packet.code}\n\n")
            except OSError as e:
                log.warning(f"== cannot write eval dump {self.dump_eval!r}: {e}")
        else:
            log.info(f"== eval: id={packet.id!r} code-len={len(packet.code)}")
        self.answer_eval(packet.id, packet.code)

    def _on_C(self, packet):
        log.info(f"== pow: input={packet.input!r}")
        self.answer_pow(packet.input)

    def _on_G(self, packet):
        log.info(f"== turnstile: site={packet.site_id!r} session={packet.session_token!r}")
        self.answer_turnstile(packet.site_id, packet.session_token)

    def _on_k(self, packet):
        self.player_token = packet.player_token
        log.info(f"== key packet: playerToken={self.player_token!r}")

    def _on_r(self, packet):
        self.travel_token = packet.travel_token
        log.info(f"== travel: server={packet.server!r} token={packet.travel_token!r}")

    def _on_K(self, packet):
        self.kicked = True
        self.kick_reason = packet.reason
        log.warning(f"== KICK: {packet.reason!r}")

    def _on_F(self, packet):
        log.info(f"== death: {packet.death_type} score={packet.score} respawn={packet.respawn_time}ms")
        self.spawned = False
        self.respawn()

    def _on_c(self, packet):
        log.info(f"== camera (spawned): x={packet.body_x} y={packet.body_y} fov={packet.body_fov}")
        self.spawned = True
        self.body_x = packet.body_x
        self.body_y = packet.body_y
        self._commands_suppressed = True
        if self.autospin:
            self.toggle("autospin")
            log.info("== toggle: autospin")
        if self.hold:
            self._commands_suppressed = True
            threading.Thread(target=self._hold_keepalive, daemon=True).start()
            return
        threading.Thread(target=self._upgrade_then_move, daemon=True).start()

    def _upgrade_then_move(self):
        time.sleep(0.05)
        for upgrade in self.upgrades:
            self.upgrade_tank(upgrade - 1)
            time.sleep(0.025)
        for index, points in enumerate(self.skills):
            for _ in range(points):
                self.upgrade_skill(index, "add")
                time.sleep(0.01)
        self._commands_suppressed = False
        self.go_to(self.target[0], self.target[1])

    def _hold_keepalive(self):
        while not self.stop.is_set():
            if self.spawned and not self.stop.is_set():
                try:
                    self.move(int(round(self.body_x)), int(round(self.body_y)))
                except Exception:
                    break
            self.stop.wait(0.5)

    def _on_m(self, packet):
        if "You have spawned" in packet.message:
            self.spawn_message_event.set()
        log.info(f"== message: {packet.message!r}")

    def _entity_name(self, entity_id):
        name = self.player_names.get(entity_id)
        if name:
            return name
        ent = self.entities.get(entity_id)
        if ent and ent.get("name"):
            return ent["name"]
        return f"#{entity_id}"

    def _on_M(self, packet):
        who = self._entity_name(packet.entity_id)
        log.info(f"== chat: {who}: {packet.message!r} global={packet.is_global}")

    def _on_R(self, packet):
        log.info(
            f"== room: {packet.info} bounds=({packet.room_x1},{packet.room_y1})-({packet.room_x2},{packet.room_y2}) tiles={len(packet.tiles)}x{len(packet.tiles[0]) if packet.tiles else 0}")

    def _on_P(self, packet):
        for p in packet.changed:
            self.player_names[p["socket_id"]] = p["name"]
            if p["self"]:
                self.entity_id = p["socket_id"]
        for p in packet.removed:
            self.player_names.pop(p["socket_id"], None)
            self.entities.pop(p["socket_id"], None)
        log.info(f"== players: {len(packet.removed)} removed, {len(packet.changed)} changed")

    def _on_J(self, packet):
        names = [m.get("name") for m in packet.mockups]
        log.info(f"== mockups: {len(packet.mockups)} tanks: {names[:8]}{'...' if len(names) > 8 else ''}")

    def _on_u(self, packet):
        self.body_x = packet.body_x
        self.body_y = packet.body_y
        if packet.body.get("id"):
            self.entity_id = packet.body["id"]
        for ent in packet.changed:
            self.entities[ent["id"]] = ent
            if ent.get("name"):
                self.player_names[ent["id"]] = ent["name"]
        for gone in packet.dead + packet.removed:
            self.entities.pop(gone["id"], None)
        if packet.body.get("color") is not None:
            self.color = packet.body["color"]
        if packet.body.get("party_code"):
            self.party_code = packet.body["party_code"]
        if self.color is None and self.entity_id is not None:
            for ent in packet.changed:
                if ent.get("id") == self.entity_id and ent.get("color") is not None:
                    self.color = ent["color"]
                    break
        if self.color is not None and self.party_code:
            self.found.set()
        log.debug(f"== update: self=({packet.body_x:.1f},{packet.body_y:.1f}) "
                  f"changed={len(packet.changed)} dead={len(packet.dead)} "
                  f"removed={len(packet.removed)} "
                  f"color={self.color} party={self.party_code!r}")
        self._log_navigation()

    def _on_b(self, packet):
        for lb in packet.leaderboard_changed:
            self.player_names[lb["id"]] = lb["name"]
        log.debug(f"== broadcast: minimap {len(packet.minimap_changed)}/{len(packet.minimap_removed)}, "
                  f"leaderboard {len(packet.leaderboard_changed)}/{len(packet.leaderboard_removed)}")

    def _handle_frame(self, op, payload):
        if op == 9:
            self.ws._send(10, payload)
            log.debug("  <- ping -> pong")
            return False
        if op == 10:
            log.debug("  <- pong")
            return False
        if op == 8:
            code = struct.unpack(">H", payload[:2])[0] if len(payload) >= 2 else None
            reason = payload[2:].decode("utf-8", "replace") if len(payload) > 2 else ""
            log.warning(f"== server closed: code={code} reason={reason!r}")
            return True
        if op == 2:
            raw = self.cipher.decrypt(payload[:-6])
            fields = decode_packet(raw)
            log.debug(f"<- [rx {self.cipher.received - 1}] {raw.hex()}")
            self.handle(fields[0], fields[1:])
            return False
        log.debug(f"<- op={op} {len(payload)}B")
        return False

    def _finish_check(self):
        if self.kicked:
            log.info("== check: KICKED — connection NOT working")
            return True
        deadline = (self.welcome_time + self.timeout) if self.timeout else time.time() + CHECK_KICK_GRACE
        while time.time() < deadline:
            if self.spawn_message_event.is_set():
                log.info("== check: WELCOME to the game — connection works")
                return True
            if self.kicked:
                break
            try:
                self.ws.sock.settimeout(max(0.1, deadline - time.time()))
            except Exception:
                break
            try:
                op, payload = self.ws._read()
            except socket.timeout:
                break
            except (EOFError, socket.error) as e:
                log.warning(f"== check: connection ended: {e}")
                break
            if self._handle_frame(op, payload):
                break
        try:
            self.ws.sock.settimeout(None)
        except Exception:
            pass
        if self.kicked:
            log.info("== check: KICKED — connection NOT working")
            return True
        log.info("== check: no spawn message (\"You have spawned\") — connection NOT working")
        return True

    def run(self):
        _bot_id_local.bot_id = self.bot_id
        try:
            self.ws.connect()
        except Exception as e:
            log.warning(f"== connect failed: {e}")
            return
        log.info("== sending handshake frame")
        build_bytes = bytes.fromhex(BUILD)[::-1]
        self.ws._send(2, bytes([0, 1, 0, 1]) + build_bytes)

        op, payload = self.ws._read()
        if op != 2 or len(payload) < 32:
            log.error(f"== unexpected first frame: op={op} len={len(payload)} {payload[:64].hex()}")
            return
        server_pub = payload[:32]
        log.debug(f"== server X25519 pubkey: {server_pub.hex()}")
        priv = secrets.token_bytes(32)
        shared = x25519(priv, server_pub)
        self.cipher = ArrasCipher(shared)
        self.ws._send(2, x25519_base(priv))
        log.info("== sent client pubkey, keys derived")
        self.send(KeyRequestPacket.build(self.player_id, self.player_token,
                                         self.travel_token), "key")

        log.info("== session live — waiting for packets (ctrl-c to stop)")
        try:
            if self.stop.wait(timeout=0):
                return
            self.ws.sock.settimeout(0.5)
            while True:
                if self.stop.is_set():
                    return
                try:
                    op, payload = self.ws._read()
                except socket.timeout:
                    continue
                if self._handle_frame(op, payload):
                    return
                if self.stop_after_welcome and self.welcome_event.is_set():
                    if self._finish_check():
                        return
                if self.timeout and time.time() - self.t0 > self.timeout:
                    self.timed_out = True
                    log.info("== timeout reached")
                    return
        except (EOFError, socket.error) as e:
            log.warning("== connection ended: %r", e)
        finally:
            try:
                self.ws.sock.settimeout(None)
            except Exception:
                pass
            try:
                self.ws.sock.close()
            except Exception:
                pass

def read_team_code(host, name="", timeout=30, auto_level_up=True, hold=True):
    bot = ArrasBot(
        host, name=name, timeout=timeout, auto_level_up=auto_level_up,
        hold=hold)
    thread = threading.Thread(target=bot.run, daemon=True)
    thread.start()
    if not bot.found.wait(timeout):
        bot.stop.set()
        return None, ""
    if not hold:
        bot.stop.set()
    return bot.color, bot.party_code
