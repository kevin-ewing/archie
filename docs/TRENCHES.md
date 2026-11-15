# Trench characteristics: British/French vs German

Reference for drawing the fronts (`src/world/military.ts`). These are broad generalisations; real
trenches varied by sector, ground, unit and month. Every claim is **[VERIFY]** until checked against a
source (trench maps, RFC/RAF air photos, the British *Notes for Infantry Officers on Trench Warfare*,
German *Stellungsbau* manuals).

The game's convention: u < 0 is the British (or French) side, u > 0 the German side.

## Why the two sides differ

- **Posture.** From late 1914 the Germans were mostly on the defensive in the West. They chose where to
  stop after the Marne, so their lines usually hold the higher ground: ridges, villages, spurs (Messines,
  Pilckem, the Somme ridges). They built to stay. **[VERIFY]**
- The British and French saw their trenches as temporary, a place to attack from. So their trenches were
  usually less elaborate, wetter (lower ground) and more often rebuilt after shelling or after a small
  advance. **[VERIFY]**
- The result, broadly: **German works are deeper, more regular and more permanent; Allied works are
  shallower, more improvised and messier.** **[VERIFY]**

## Rudimentary trenches (1914, early 1915): the same on both sides

- In 1914 (the "race to the sea", First Ypres) both sides dug in wherever they stopped. First rifle
  pits and scrapes, then the pits were joined into ragged lines. **[VERIFY]**
- They were shallow, irregular and squiggly, following hedges, ditches, sunken lanes and field edges, with
  little wire and few dugouts. **[VERIFY]**
- Design differed little between the sides, so **drawing them the same on both sides, squiggly, is
  right.** This is the `hasty` style. **[VERIFY]**

## Developed trenches (1915–16): where the styles part

| | British / French | German |
|---|---|---|
| Fire trench | Traversed (square bays, "crenellated" in plan), bays ~10 yd; often uneven, rebuilt in patches | Traversed too, but more regular and better kept; deeper, firing steps revetted |
| Flanders (high water table) | **Breastworks**: sandbag parapets built *up* rather than dug down; "grouse butts"; constant bailing | Breastworks too where wet, but from 1916–17 **concrete** shelters and MG posts (MEBU, "pillboxes") behind the line |
| Revetting | Sandbags, corrugated iron, A-frames, duckboards; French wattle hurdles (*clayonnage*), gabions | Timber, wicker, planking; later concrete |
| Dugouts | Shallow: "funk holes" cut into the parapet, small shelters, some deeper ones later | **Deep dugouts** (*Stollen*) 6–12 m down, especially on the chalk of the Somme, often with two entrances; some electric light **[VERIFY depths]** |
| Lines | Fire, support (~70–100 yd back), reserve (~400–600 yd back), joined by communication trenches **[VERIFY]** | A *position* of usually three lines ~150–250 m apart, then a second position 2–3 km back (Somme 1916) **[VERIFY]** |
| Wire | Thinner belts, laid at night under fire: knife rests, concertinas, low entanglements | **Thick, deep belts** (several belts, each 10–30 m deep), carefully staked **[VERIFY]** |
| Strongpoints | Redoubts, often improvised from ruined farms | Fortified villages and woods, redoubts at intervals, MG nests; farm ruins turned into concrete strongpoints |
| Communication trenches (French *boyaux*) | Many, zig-zag, often a dense lattice (French sectors especially) | Fewer, straighter, better built |
| From the air | Ragged, repaired, wet; sandbag parapets; lots of saps and short connecting trenches | Sharper, more geometric lines; pale chalk spoil on the Somme; paired dugout entrances visible as dots behind the parapet |

## Later German defence (1917 onward, for reference)

- The Hindenburg Line and "elastic defence in depth": thinner front lines, then zones instead of lines.
  First an outpost zone, then a battle zone of strongpoints, pillboxes and MG nests 1–2 km deep, then a
  rear zone. **[VERIFY]**
- Wire was laid in wide **zigzag belts** that funnelled attackers into machine-gun fields. **[VERIFY]**
- In Flanders (Third Ypres, 1917) the German front became shell-hole positions and lines of pillboxes
  more than continuous trenches. **[VERIFY]**
- This is outside the game's 1915–16 span, but is useful if a front ever ages.

## What this means for the game's styles

- **hasty** (1914–early 1915, both sides): squiggly, shallow, identical either side. Keep as is.
- **traversed, Allied side** (u < 0): square bays but less regular (bay lengths and offsets vary more,
  patches rebuilt). Sandbag breastworks in Flanders. Thinner wire, more saps and short connecting
  trenches, shallow dugouts.
- **traversed, German side** (u > 0): more regular bays, cleaner lines. Thicker, deeper wire belts.
  Deep-dugout entrances behind the fire trench. Fortified farms and villages as strongpoints, plus
  concrete MG posts behind the line in Flanders from 1916.
- **Ground**: German lines tend to sit on the higher ground and follow it, Allied lines lower and wetter.
  This only matters once the landscape has height, so it's a later step.
- **By chapter**: Flanders 1915 means breastworks and wet ground on both sides, the Allies' more
  improvised. The Somme 1916 means chalk spoil, deep German dugouts and the German second position well
  behind.
