import base64

COLOR_NAMES = [
    'teal', 'lgreen', 'orange', 'yellow', 'aqua', 'pink',
    'vlgrey', 'lgrey', 'guiwhite', 'black',
    'blue', 'green', 'red', 'gold', 'purple', 'magenta',
    'grey', 'dgrey', 'white', 'guiblack',
]

V1_MAGIC = bytes([0x6a, 0xba, 0xda, 0xb3, 0xf0])
V1_VERSION = 1

def _pad_b64(s):
    r = len(s) % 4
    if r == 2:
        return s + '=='
    elif r == 3:
        return s + '='
    return s

def _b64_decode(s):
    return base64.b64decode(_pad_b64(s.replace(' ', '')))

def _b64_encode(data):
    return base64.b64encode(data).decode().rstrip('=')

def decode_v1(data):
    if data[:5] != V1_MAGIC:
        raise ValueError('Not v1 format (bad magic)')
    off = 5

    version = data[off]; off += 1
    if version != V1_VERSION:
        raise ValueError(f'Unexpected v1 version: {version}')

    name_len = data[off]; off += 1
    name = data[off:off + name_len].decode('utf-8', errors='replace'); off += name_len

    author_len = data[off]; off += 1
    author = data[off:off + author_len].decode('utf-8', errors='replace'); off += author_len

    table_len = data[off]; off += 1
    table = []
    for i in range(table_len):
        r, g, b = data[off], data[off + 1], data[off + 2]
        table.append((r << 16) | (g << 8) | b)
        off += 3

    special_len = data[off]; off += 1
    special = []
    for i in range(special_len):
        r, g, b = data[off], data[off + 1], data[off + 2]
        special.append((r << 16) | (g << 8) | b)
        off += 3

    blend = data[off] / 0xff; off += 1
    neon = bool(data[off]); off += 1

    return {
        'name': name or 'Unknown Theme',
        'author': author,
        'table': table,
        'specialTable': special,
        'blend': round(blend, 4),
        'neon': neon,
    }

def decode_v0(data):
    if data[:5] == V1_MAGIC:
        raise ValueError('Looks like v1, not v0')

    idx = data.find(0)
    if idx == -1:
        raise ValueError('No null terminator for name')
    name = data[:idx].decode('utf-8', errors='replace').strip() or 'Unknown Theme'
    data = data[idx + 1:]

    idx = data.find(0)
    if idx == -1:
        raise ValueError('No null terminator for author')
    author = data[:idx].decode('utf-8', errors='replace').strip()
    data = data[idx + 1:]

    if len(data) < 1:
        raise ValueError('Missing blend byte')
    blend = data[0] / 0xff
    data = data[1:]

    palette_size = len(data) // 3
    if palette_size < 2:
        raise ValueError(f'Too few colors: {palette_size}')

    table = []
    for i in range(palette_size):
        r, g, b = data[i * 3], data[i * 3 + 1], data[i * 3 + 2]
        table.append((r << 16) | (g << 8) | b)

    return {
        'name': name,
        'author': author,
        'table': table,
        'specialTable': [table[9] if len(table) > 9 else table[0]],
        'blend': round(blend, 4),
        'neon': False,
    }

def decode(code):
    code = code.strip()

    try:
        data = _b64_decode(code)
        if data[:5] == V1_MAGIC:
            return decode_v1(data), 'v1'
    except Exception:
        pass

    try:
        data = _b64_decode(code)
        result = decode_v0(data)
        return result, 'v0'
    except Exception:
        pass

    raise ValueError('Could not decode theme code (tried v1 and v0)')

def int_to_rgb(color_int):
    return (color_int >> 16) & 0xff, (color_int >> 8) & 0xff, color_int & 0xff

def to_json_dict(theme):
    table = theme['table']
    content = {}
    for i, name in enumerate(COLOR_NAMES):
        if i < len(table):
            r, g, b = int_to_rgb(table[i])
            content[name] = f'#{r:02x}{g:02x}{b:02x}'
    return {
        'name': theme['name'],
        'author': theme['author'],
        'content': content,
        'paletteSize': len(table),
        'border': theme['blend'],
        'neon': theme.get('neon', False),
    }

def from_json_dict(d):
    content = d.get('content', d)
    table = []
    for name in COLOR_NAMES:
        hex_str = content.get(name, '#000000')
        if isinstance(hex_str, str) and hex_str.startswith('#') and len(hex_str) == 7:
            table.append(int(hex_str[1:], 16))
        else:
            table.append(0)
    return {
        'name': d.get('name', 'Unknown Theme'),
        'author': d.get('author', ''),
        'table': table,
        'specialTable': [table[9]],
        'blend': float(d.get('border', 0.65)),
        'neon': False,
    }

def encode_v1(theme):
    name = theme['name'][:40].encode('utf-8')
    author = theme['author'][:40].encode('utf-8')
    table = theme['table']
    special = theme['specialTable']
    blend = theme['blend']
    neon = theme['neon']

    parts = bytearray()
    parts.extend(V1_MAGIC)
    parts.append(V1_VERSION)
    parts.append(len(name))
    parts.extend(name)
    parts.append(len(author))
    parts.extend(author)
    parts.append(len(table))
    for c in table:
        parts.extend([(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff])
    parts.append(len(special))
    for c in special:
        parts.extend([(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff])
    blend_byte = 255 if blend >= 1 else (0 if blend < 0 else int(blend * 0x100))
    parts.append(blend_byte)
    parts.append(1 if neon else 0)

    return _b64_encode(bytes(parts))

def encode_v0(theme):
    name = theme['name'][:40]
    author = theme['author'][:40]
    blend = theme['blend']
    table = theme['table']

    parts = bytearray()
    parts.extend(name.encode('utf-8'))
    parts.append(0)
    parts.extend(author.encode('utf-8'))
    parts.append(0)
    blend_byte = 255 if blend >= 1 else (0 if blend < 0 else int(blend * 0x100))
    parts.append(blend_byte)
    for c in table:
        parts.extend([(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff])

    return _b64_encode(bytes(parts))

def theme_summary(theme):
    n = len(theme['table'])
    return f"{theme['name']} by {theme['author'] or '?'} ({n} colors, blend={theme['blend']}, neon={theme['neon']})"
