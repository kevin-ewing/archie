# Archie — Open Questions for Kevin

> Answer inline (just type under each question). I'll fold answers into `MECHANICS.md` / `STORY.md` / `TECH.md` and delete them from here.
> **Bold = what the rough draft currently does**, so you can feel it before answering.

---

## A. Camera & the turn

1. **How much should the plane swing on screen during a turn before the world catches up?** Draft: ~15° at full bank, camera catches up in ~0.6 s. More swing = more drama, less = steadier.
2. **After levelling off, should the plane end up pointing straight up the screen again** (draft: yes, the world stays rotated), or should it *stay* at an angle on screen?
3. Should the camera ever **not** be heading-up? (e.g. a north-up option, or the map overlay north-up only)
4. **Where is the plane's home spot?** Draft: centred, 62% down the screen (more ground ahead). Should it shift further back at full power (more look-ahead)?
5. How far should sudden manoeuvres push the plane off home? Draft: up to 40 game px. Should it overshoot and wobble (draft: slightly) or ease back smoothly?
6. Should the camera **zoom** at all, e.g. pull out slightly at higher altitude bands, or stay at a fixed pixel size always?

## B. Steering & input

7. **Mouse steering: position or movement?** Draft: mouse **position** relative to screen centre sets the bank (centre = straight). The alternative is relative movement (pointer lock, like an FPS), which is smoother but captures the cursor.
8. How wide should the mouse steering zone be? Draft: 30% of screen width from centre = full bank.
9. **Touch steering:** draft is *drag sideways from where you touched*, and lifting straightens. Alternatives: a fixed on-screen virtual stick, or tilting the phone (gyro).
10. Should letting go on touch **straighten immediately** (draft: yes), or hold the last bank?
11. Is there **a way to climb and descend?** If so, on mouse (wheel? right button?) and touch (two-finger drag? buttons)? Altitude bands are in the design but have no control yet.
12. Should **keyboard-only** play be fully supported (A/D/Space work in the draft), or mouse/touch only?
13. **Gamepad support:** wanted, later, or never?
14. How should the **Hold circuit** flying aid be triggered on touch, now that long-press conflicts with steering? (HUD button? double-tap with two fingers?)
15. *(Partly answered by **Hands off**: let go, and the cursor is free.)* With the mouse being the stick, how do you **click UI** (wireless radial, clock-code disc) during flight without jerking the plane? Options: a modifier key that frees the cursor, the plane auto-holding its bank while a menu is open, or UI on the keyboard.

## C. Engine: full power

16. **Mouse:** is *hold the button* right, or *click to toggle*? Draft: hold.
17. **Touch:** is *double-tap and hold the second tap* right (draft), or should a double-tap **toggle** full power on/off so the finger can just steer?
18. How long should full power last from a cold engine before overheating? Draft: ~8 s, then a forced cool-down to 40% heat.
19. What should overheating **cost**? Draft: just a lockout. Options: lost speed, smoke, a chance of engine damage, a stopped engine with a glide home.
20. Should there be more than two engine settings (e.g. throttled back to save fuel and stay quiet, or loiter)?
21. Should **fuel** matter much day to day, or mostly be a "don't waste it" pressure? Draft: a full tank lasts one 12-minute day at cruise.
22. Should full power do anything besides speed: help escape Archie or fighters, climb faster, be louder?

## D. Plane & sprite

23. **Plane size on screen:** draft sprite is 32×24 game px (small on big monitors). Bigger, smaller, or right?
24. How many **bank frames**? Draft: 5 (hard left, left, level, right, hard right). Also want pitch frames (nose up/down) for climbing?
25. Do you want a **visible spinning prop**, exhaust smoke, or engine smoke when hot?
26. **Roundels and colours:** British clear-doped linen, as in the draft? Any squadron markings or serial number?
27. Will you draw the final sprites yourself (and what size and format), or should they stay procedural?

## E. Ground & world look

28. Is the **noise patchwork** the right direction for the Flanders base layer? Too blotchy, too smooth, too colourful?
29. What should be **added on top of the noise first**: roads, field boundaries and hedgerows, villages, canals, trenches?
30. Should field patches look like **real field shapes** (rectangular strips, hedged plots) rather than soft noise blobs?
31. How much **dithering** do you like? Draft: 4×4 ordered dither on all colour transitions.
32. **Water:** ponds and floods (draft), or mostly canals and drainage ditches (more accurate for Flanders)?
33. Should the world be **bounded** (a sector map with edges, matching the design) or infinite (draft) while we prototype?
34. **Front line direction:** always north–south with the enemy to the east?

## F. Clouds

35. Cloud amount: draft about 21% coverage. More, less, or variable by weather (it's in the design)?
36. Should clouds be **above the plane only** (draft), or also low clouds *below* it that hide the ground (in the design)?
37. Should flying **into** a dense cloud white out the screen (and hide you from fighters)?
38. Cloud **shadows** on the ground: wanted? (Cheap and atmospheric.)
39. Are 2× cloud pixels right, or should clouds share the ground's pixel size?

## G. Light, time & mood

40. When do we add the **day cycle** (palette shift toward sunset)? Is it the next priority?
41. Does the sun direction (shadow angle) move through the day?
42. Any **weather** you want in the first prototype (rain, haze, wind you can feel)?

## H. HUD & UI

43. Draft HUD is just two bars (heat, fuel). What must be on screen at all times vs. only when relevant?
44. **Diegetic gauges** (drawn instruments, pocket-watch) or minimal bars?
45. What should the controls hint and tutorial text look like: pixel font, typewriter, handwritten?
46. **Pixel font:** a specific style in mind? (1915 typewriter, stencil, handwritten pencil?)

## I. Gameplay next steps

47. What's the next mechanic to prototype: **shell bursts and clock-code spotting**, the **day cycle and sunset exit**, or **world features** (trenches, battery, dugout)?
48. Should the first playable loop include a **win state** (target destroyed), or just free flight plus spotting practice?
49. Should **Archie** appear in the first prototype?

## J. Audio

50. When do you want to start on the synth soundtrack? Is there a first sound you want to hear (the engine drone, the key clicks)?
51. Should engine sound change with full power and heat?

## K. Tech & tooling

52. **Hosting** for test builds: GitHub Pages, Netlify, itch.io?
53. Do you want **debug tools** (seed picker, slow-mo, free camera, FPS counter) behind a key?
54. Should I **commit** to git as I go (small commits with messages), or leave committing to you?
55. Target devices to test on: which phone(s) and browsers do you have?
