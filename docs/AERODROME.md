# Rook Field: the pilot's desk

STORY opens the pilot's desk in the barn at Rook Field, seen from straight above and filling the screen. It's drawn in flight's own pixel size (the same `view.scale`) and has no perspective. Old planks run across, with grain, knots, nail heads and old mug rings. The things of the job lie on them, scattered the way a desk gets, but every usable one stays mostly in view: each is placed where it covers the least of those already down, and the plates' corner is kept clear. It lays itself out for any screen, from a wide desktop to a phone held upright.

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
- **[VERIFY]** The clock-code card's ring letters and distances (Y Z A B C D E F, 10 to 500 yards), and the period details: the penny stamp, the "Navy Cut" tin, the "Swan" matches and the pilot's flying log book.
