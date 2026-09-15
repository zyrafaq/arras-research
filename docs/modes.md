Source: js-client/docs/MODES.md

# Arras.io Mode IDs

Mode IDs identify a server's game configuration. They appear in the `$ ping`
command and in-game at the bottom right, above the minimap. The original
client also receives them per-server in the status list (the `gamemode`
field), so the JS client must parse them for the server selector.

A Mode ID has 3 parts, concatenated with no separators:

  [modifiers][team count][win conditions]

Live servers (status mirrors, verified 2026-08) append extra segments to
this core; see section 4.

## 1. Modifiers

Optional; 0 up to 6 modifiers. When present they always appear in this order:

  Letter | Description
  -------|------------
  g      | Growth
  a      | Arms Race
  p      | Portal
  o      | Open
  m      | Maze
  r      | Rock

## 2. Team Count

Required, exactly one of:

  Value  | Description
  -------|------------
  f      | FFA
  d      | Duos
  s      | Squads
  c      | Clan Wars
  1-9    | Number of teams (1 is valid but not shown in the display name)

## 3. Win Condition

Optional (default: no win condition). Zero or more, cannot repeat:

  Letter | Description
  -------|------------
  d      | Domination
  m      | Mothership
  a      | Assault
  s      | Siege
  t      | Tag
  p      | Pandemic
  b      | Soccer
  g      | Grudge Ball
  e      | Elimination
  c      | Capture the Flag
  z      | Sandbox

## Parsing notes

- Letters are ambiguous across sections (g, a, p, m, s, d all appear twice) —
  position disambiguates, not the letter itself:
  - before the team-count token -> modifier
  - the first valid team-count token terminates the modifier section
  - everything after it -> win-condition list
- Parse greedily left-to-right; validate modifiers against the fixed order.
- Reject duplicate win conditions.
- If the team-count slot doesn't hold a valid token, retry without a team
  count (special modes often omit it).

## 4. Special modes (live-status extensions)

Learned by diffing the live status list (228 servers across the uvwx
mirrors, 2026-08) against known ground truths. After the core grammar,
ids may contain:

- Event slot — a leading e<digits> picks a special-server instance
  and is not displayed: e0z -> Sandbox, e5forge -> Forge,
  e9labyrinth -> Labyrinth.
- Old series — an embedded olds/old tag prefixes the first mode
  name with "Old": w33oldscdreadnoughts -> Old Dreadnoughts,
  w33olds5forge -> Old Forge, w33olds9labyrinth -> Old Labyrinth.
- Named modes — verbatim words embedded in the id, matched
  longest-first and appended after the grammar segments: blitz, bunker,
  citadel, dreadnoughts, forge, fortress, labyrinth, limbo, manhunt,
  nexus, stronghold, tartarus, ...
- Version params — bare digits and x<digits>[<letter>] chunks
  (e.g. x15, x1a) are server-instance parameters and are not displayed.

Ground-truth examples from live servers:

  Code                           | Display
  -------------------------------|------------------------------
  e0z                            | Sandbox
  ovh-syd-w33oldscdreadnoughts   | Old Dreadnoughts
  ovh-hil-rf                     | Rock FFA
  wsi-kci-ga1sx15blitz           | Growth Arms Race Siege Blitz
  hetzner-fsn-gm2ax16bunker      | Growth Maze 2 Teams Assault Bunker
  ovh-hil-am2ax1astronghold      | Arms Race Maze 2 Teams Assault Stronghold
  wsi-kci-gae7manhuntmf          | Growth Arms Race Manhunt
