import struct

SUBPROTOCOL = "arras.io#v1.4+sl+et0"

HANDSHAKE = bytes([0x00, 0x01, 0x00, 0x01, 0x9D, 0x8D, 0xE2, 0x23, 0x9D, 0x49, 0x18, 0x4B])


class Reader:
    def __init__(self, buf, start=4):
        self.buf = buf
        self.pos = start
        self.max = len(buf)

    def _clz(self, b):
        if b == 0xFF:
            return 8
        n = 0
        while (b & 0x80):
            n += 1
            b <<= 1
        return n

    def read(self):
        if self.pos >= self.max:
            return ('end',)
        b = self.buf[self.pos]
        k = self._clz(b)
        if k == 8:
            if self.pos + 5 > self.max:
                return ('end',)
            self.pos += 5
            raw = int.from_bytes(self.buf[self.pos - 4:self.pos], 'little', signed=False)
            return ('float', struct.unpack('<f', self.buf[self.pos - 4:self.pos])[0], raw)
        if k == 0:
            self.pos += 1
            return ('control', b)
        if k == 1:
            self.pos += 1
            v = (b | 0xFFFFFFC0)
            if v >= (1 << 31):
                v -= (1 << 32)
            return ('negative', v)
        extra = k - 2
        if self.pos + 1 + extra > self.max:
            return ('end', None)
        self.pos += 1
        val = b
        for _ in range(extra):
            val = (val << 8) | self.buf[self.pos]
            self.pos += 1
        return ('int', val)

HANDLERS = {
    0x43: 0xba2c8,  0x46: 0xbafe4,  0x47: 0x16480,  0x4a: 0x5be78,
    0x4b: 0x25fe8,  0x4d: 0x5daec,  0x50: 0x81b30,  0x52: 0x97c84,
    0x61: 0x4aa28,  0x62: 0x347dc,  0x63: 0xb3e84,  0x65: 0xf19f0,
    0x6b: 0xf3e94,  0x6d: 0x457b4,  0x70: 0x108eac,  0x72: 0x17994,
    0x75: 0xec8d8,  0x77: 0xbc040,
}

def parse_message(data, verbose=True):
    if len(data) < 4:
        return None
    typ = int.from_bytes(data[0:4], 'little')
    header = {
        'type': typ,
        'hdr_04_07': data[4:8].hex(),
        'hdr_08_0f': data[8:16].hex(),
        'hdr_10': int.from_bytes(data[16:20], 'little'),
        'hdr_14_15': data[20:22].hex(),
        'hdr_16_1f': data[22:32].hex(),
        'block_20_5f': data[0x20:0x60].hex() if len(data) >= 0x60 else None,
    }
    events = []
    r = Reader(data, start=4)
    tag = 0
    while True:
        v = r.read()
        if v[0] == 'end':
            break
        if v[0] == 'control':
            tag = v[1]
            events.append({'tag': f'0x{tag:02x}', 'handler': HANDLERS.get(tag), 'fields': []})
        else:
            if events:
                events[-1]['fields'].append(v)
    return {'header': header, 'events': events}

if __name__ == '__main__':
    import sys
    for path in sys.argv[1:]:
        data = open(path, 'rb').read()
        res = parse_message(data, verbose=True)
        print(path, 'len', len(data))
        print('type 0x%08x' % res['header']['type'], 'block', res['header']['block'][:32] + '…')
        for ev in res['events']:
            print('  tag', ev['tag'], '->', '0x%x' % ev['handler'], 'fields', ev['fields'])
