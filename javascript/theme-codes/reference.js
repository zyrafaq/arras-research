let original = document.getElementById('original')
let converted = document.getElementById('converted')
let originalFormat = document.getElementById('original-format')
let convertedFormat = document.getElementById('converted-format')
let convert = document.getElementById('convert')

let parsers = {
  json(string) {
    let output = JSON.parse(string)
    if (typeof output !== 'object')
      return null
    let { name, author, content } = output

    let table = []
    for (let colorHex of [
      content.teal,
      content.lgreen,
      content.orange,
      content.yellow,
      content.lavender,
      content.pink,
      content.vlgrey,
      content.lgrey,
      content.guiwhite,
      content.black,

      content.blue,
      content.green,
      content.red,
      content.gold,
      content.purple,
      content.magenta,
      content.grey,
      content.dgrey,
      content.white,
      content.guiblack,
    ]) {
      if (typeof colorHex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(colorHex))
        return null
      table.push(parseInt(colorHex.slice(1), 16))
    }
    table[4] = table[0]
    table[7] = table[16]

    let blend = Math.min(1, Math.max(0, content.border))

    return {
      name: (name || '').trim().slice(0, 40) || 'Unknown Theme',
      author: (author || '').trim().slice(0, 40),
      table,
      specialTable: [table[9]],
      blend,
      neon: false,
    }
  },
  v0(string) {
    let stripped = string.replace(/\s+/g, '')
    if (stripped.length % 4 == 2)
      stripped += '=='
    else if (stripped.length % 4 == 3)
      stripped += '='
    let data = atob(stripped)
    if (data.startsWith('\x6a\xba\xda\xb3\xf0')) return null

    let index = data.indexOf('\x00')
    if (index === -1) return null
    let name = (data.slice(0, index) || '').trim().slice(0, 40) || 'Unknown Theme'
    data = data.slice(index + 1)

    index = data.indexOf('\x00')
    if (index === -1) return null
    let author = (data.slice(0, index) || '').trim().slice(0, 40)
    data = data.slice(index + 1)

    let blend = data.charCodeAt(0) / 0xff
    data = data.slice(1)

    let paletteSize = Math.floor(data.length / 3)

    let table = []
    for (let i = 0; i < paletteSize; i++) {
      let red = data.charCodeAt(i * 3)
      let green = data.charCodeAt(i * 3 + 1)
      let blue = data.charCodeAt(i * 3 + 2)
      let color = (red << 16) | (green << 8) | blue
      table.push(color)
    }
    table[4] = table[0]
    table[7] = table[16]

    return {
      name,
      author,
      table,
      specialTable: [table[9]],
      blend,
      neon: false,
    }
  },
  tiger(string) {
    if (!string.startsWith('TIGER_JSON'))
      return null
    let output = JSON.parse(string.replace('TIGER_JSON', ''))
    if (typeof output !== 'object')
      return null
    let {
      themeDetails: { name, author },
      config: {
        graphical: { darkBorders, neon },
        themeColor: { table, border },
      },
    } = output

    table = table.map(colorHex => typeof colorHex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(colorHex) ? 0 : parseInt(colorHex.slice(1), 16))

    table[4] = table[0]
    table[7] = table[16]

    let blend = Math.min(1, Math.max(0, border))

    return {
      name: (name || '').trim().slice(0, 40) || 'Unknown Theme',
      author: (author || '').trim().slice(0, 40),
      table,
      specialTable: [table[neon ? 18 : 9]],
      blend: darkBorders ? 1 : blend,
      neon,
    }
  },
}

let stringifiers = {
  v0(theme) {
    let { name, author, table, blend } = theme

    let string = name + '\x00' + author + '\x00'
    string += String.fromCharCode(blend >= 1 ? 255 : blend < 0 ? 0 : Math.floor(blend * 0x100))
    for (let color of table) string += String.fromCharCode(color >> 16, (color >> 8) & 0xff, color & 0xff)

    return btoa(string).replace(/=+/, '')
  },
  v1(theme) {
    let { name, author, table, specialTable, blend, neon } = theme
    
    let string = '\x6a\xba\xda\xb3\xf0'
    string += String.fromCharCode(1)
    string += String.fromCharCode(name.length) + name
    string += String.fromCharCode(author.length) + author
    string += String.fromCharCode(table.length)
    for (let color of table) string += String.fromCharCode(color >> 16, (color >> 8) & 0xff, color & 0xff)
    string += String.fromCharCode(specialTable.length)
    for (let color of specialTable) string += String.fromCharCode(color >> 16, (color >> 8) & 0xff, color & 0xff)
    string += String.fromCharCode(blend >= 1 ? 255 : blend < 0 ? 0 : Math.floor(blend * 0x100))
    string += String.fromCharCode(neon ? 1 : 0)
    return btoa(string).replace(/=+/, '')
  },
}

let parseTheme = string => {
  for (let [format, parser] of Object.entries(parsers)) {
    try {
      let theme = parser(string)
      if (theme) return { theme, format }
    } catch (e) {}
  }
  return null
}

let stringifyTheme = (theme, format) => {
  if (stringifiers.hasOwnProperty(format)) {
    return stringifiers[format](theme)
  }
  return ''
}

convert.addEventListener('click', () => {
  let { theme, format } = parseTheme(original.value) ?? { theme: null, format: 'unknown' }
  originalFormat.value = format
  
  if (theme != null) {
    converted.value = stringifyTheme(theme, convertedFormat.value)
  }
})