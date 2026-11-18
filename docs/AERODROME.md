# Rook Field: the pilot's desk

STORY opens the pilot's desk in the barn at Rook Field, seen from straight above and filling the screen. It's drawn in flight's own pixel size (the same `view.scale`) and has no perspective. Old planks run across, with grain and old mug rings. The things of the job lie on them, scattered the way a desk gets, but every usable one stays mostly in view: each is placed where it covers the least of those already down, and the plates' corner is kept clear. It lays itself out for any screen, from a wide desktop to a phone held upright.

- **Usable things** (press one to pick it up: it comes to the top of the pile and is held up close, with what you can do with it):
  - the **flying helmet** and goggles: go and fly (TAKE OFF, or CONTINUE a saved story flight);
  - the **orders** on their clipboard, with the next sortie, its date and TAKE OFF;
  - the **chart** of the sector;
  - the bundle of **letters**;
  - the **photograph** from home;
  - the **log book**: your story flights, written up when you return to the main menu, with a fly button;
  - the **clock-code card**;
  - the **desk calendar**, showing the campaign date.
- **Things that just lie there:** a message pad, a tobacco tin, a mug of tea, a hurricane lamp, a pocket compass, matches, a pencil, a fountain pen and spent matches.
- **Plates (top right)** do the main things directly: TAKE OFF, CONTINUE or SORTIE n; LOG BOOK; SETTINGS; MAIN MENU. Esc puts a thing down, then leaves the desk.
- **Straight there:** `?story` opens the desk directly, and `?day=N` sets the campaign day (the calendar and the orders' date).
- **Code:** the drawings are in [desk-items.ts](../src/story/desk-items.ts), the desk and its layout in [barn-art.ts](../src/story/barn-art.ts), and the controls in [barn.ts](../src/story/barn.ts). All of it is drawn in code, the same for everyone. It's a stand-in until generated art replaces the base.
- **[VERIFY]** The exact postage on military envelopes, the "Navy Cut" tin, the "Swan" matches and the logbook cover. The [clock-code rings and period object references](HISTORICAL_RESEARCH.md#aircraft-guns-and-the-desk) are documented.

## How it behaves

- **Picking up:** the thing lifts off the desk from where it lies, turning square as it comes up close, while the room dims behind it (about 0.4 s, eased). Its note and buttons then appear under it. Putting it down flies it home to its place, and the room lightens. On hover or focus a thing rises 2 px over 0.12 s, drawn on device pixels so the rise is smooth. With reduced motion, all of this is instant.
- **Sizes:** the maps shrink a little on smaller screens, never below 85 %, in 5 % steps, then stay that size and just crop more. The things you use shrink as far as they need to stay whole and easy to press, down to half size, but only in steps where every one of their pixels is a whole number of device pixels square (`sizes()` in barn-art.ts). Everything rearranges for the new size.
- **Speed:** every drawing is made once and kept (`drawing()`). So do the shadows. The bare planks are made once, with room to grow, and smaller screens see a crop of them. The first desk takes about 0.4 s and is prepared as soon as STORY is pointed at or focused. After that a resize costs about 1 ms, and the layout runs at most once a frame while the window is dragged. The close-ups are drawn while the browser is idle, so picking one up costs about 4 ms.

## The log book's parameters

The story sets the cover (`LogbookCover` in desk-items.ts; `BarnInfo.logbook`):

- `rank`: written in his own hand on the RANK line. It starts as **2ND LIEUT.**, a rank attested for RFC pilot appointments in 1915. Tom’s specific commission and probation status remain open. [Historical research](HISTORICAL_RESEARCH.md#cast-and-voice)
- `formerRank`: after a promotion, the old rank is struck through above the new one.
- `number`: the book's number, pencilled in by the clerk at the top left (159 to start).
- `wear`: 0 (new) to 1 (a long war). More handling darkens the edges, adds scuffs and spreads foxing. For now it rises a little with every flight logged.

## The clutter

What just lies about (`src/story/clutter.ts`). It's drawn the way the coffee and the log book are: colour and tone built up per pixel, lit from the top-left with no outlines, broad shading dithered in the desk's tone steps, and thin parts in whole tones. Each thing is turned any way at all (its drop shadow still falls down-right) and drawn at the same size as the things you use, so it shrinks with the mug.

- **The things:** a message pad with spotting notes, a postcard of Ypres, a pocket knife, a pewter hip flask, an ashtray cut from an 18-pounder shell case, a tin of Navy Cut, a candle stub in an enamel saucer, a bottle of ink, a spanner, a box of Swan matches, a pencil, a fountain pen, two .303 rounds, and spent matches and cigarette ends left by the ashtray and the candle.
- **Where it goes:** it fills what's left, biggest first. Each piece goes where it covers least of the things you use (weighted three times), the calendar's face and the clutter already down, and never what anything keeps clear.
- **Not buttons:** none of the clutter is a button except the **sixpence** (desk-items.ts `coinArt`), which you can pick up.
- **[VERIFY]** the period details: "Daily Mail" in 1915, Navy Cut and Swan Vestas tins, the 18-pounder case-base ashtray as trench art, and ".303" rounds on an aerodrome desk.

## The controls (for now)

TAKE OFF from the goggles or the orders, the log book's button, and the first plate all go straight to **Free Fly**. Story flights (resuming, keeping their place, the log book's entries) come back with the missions. SETTINGS opens the shared settings panel, with BACK returning to the desk. MAIN MENU returns to the landing page, and Esc puts down what you're holding, then leaves the desk.

## Picking up from under a pile; the barn's loading screen

- **Under something:** if anything lies on the thing you press, what lies on it fades away first (0.09 s), with the thing still where it lies. Then it rises. Putting it down, it lands first, and what lies on top of its place closes back over it (0.11 s). That's the covers layer in barn.ts: whatever is above it in the pile, cut to its own outline. So it never shows through what's on top of it, never jumps out over the pile, and never pops back under it. It works for any stack and any turn.
- **Loading screen:** the arrangement is worked out behind the barn's own loading screen, in the desk's brown. A phrase from `BARN_LOADING` (barn.ts) sits in the game's lettering above the first load's three pulsing pixels. It shows when the desk opens (from the main menu or `?story`), and on every resize until the window has been still for a moment and the new arrangement is ready. A resize puts down anything you're holding.
