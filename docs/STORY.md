# Archie — Story Bible

> Status: **Draft v0.8** · Last updated: 2026-11-13
> We storyboard here together. Mechanics live in [`MECHANICS.md`](MECHANICS.md).

---

## Locked decisions

- **Title:** *Archie* (RFC slang for enemy anti-aircraft fire). A subtitle is still to be chosen.
- **Core concept: "The Voice on the Ground."** A Firewatch-like relationship built entirely through one-way Morse (you) and cloth ground panels (him).
- **The player** is the pilot. They fly, spot *and* key the wireless, so the relationship is theirs.
- **The other half** is an RFC wireless operator, an enlisted air mechanic posted to the guns. He's working class, in a muddy dugout, worlds apart from an officer pilot.
- **Period:** 1915 – late 1916 (single-seat spotting is historically accurate here).
- **No takeoffs or landings, ever.** Each day's sortie starts airborne and usually fades at dusk as the aerodrome flares come into view. Days cut short fade at a cloud bank, squall, friendly lines or the coast. Then it cuts to the squadron office.
- **No Armistice ending.** The ending is **bittersweet**: both men survive, but they're separated (wounded, posted or transferred). The last panel or letter carries the weight.
- **They never meet.** Not once. You only ever know each other through cloth, Morse and paper. The player never sees his face; at most a figure on the ground, far below.
- **Two chapters.** Chapter 1 is **Flanders** (1915 into 1916). Chapter 2 is the **Somme** (summer 1916), after the squadron transfers. His battery stays behind; in Chapter 2 a new young operator takes his place.
- **Failure is story.** Being shot down or wounded never ends the game. Hospital days, his letters finding you there, and a changed sector when you return.
- **Length:** 4–6 hours, roughly 20–25 flying days.
- **Tone: sombre and grounded, in the spirit of *Masters of the Air*.** The air war as attrition, not adventure:
  - **The cost is constant.** Empty chairs at breakfast, kit packed up from a bunk, new faces who don't learn names before they're gone.
  - **Understated, not melodramatic.** Grief is shown in small routines (a name rubbed off the board, a letter left unopened), rarely spoken outright.
  - **Humour exists, as coping.** Dry, gallows humour among the men and in the old hand's margins. It's how people survive, never the point.
  - **Youth against the machine.** The pilot starts with bravado and is slowly worn down. The weight of the job (shells you direct kill men on the ground) is acknowledged, not glossed over.
  - **Beauty and dread side by side.** A golden sunset over a ruined landscape. The view from the air is lovely and terrible.
- **Soundtrack:** a continuous, JavaScript-synthesised score that follows the story without breaks. Details to be revisited.
- **A story game.** Not idle and not action. Tension comes from judgement, not reflexes. The calendar advances only when you fly. Nothing happens while you're away.
- **One evolving sector.** The same generated landscape scars over time, so the land itself remembers what you did together. His dugout is a fixed place you learn to find.
- **Days last 10–15 minutes** of real time, and the game plays equally on desktop and mobile.
- **No levels.** The world is procedurally generated, and the story unfolds **over the campaign calendar**, day by day (see `MECHANICS.md` §9.4).
- **Every day ends at sunset.** The light fades, he lays the "go home" panel, and you turn west for the trenches and the aerodrome. This nightly ritual is a story device: how he says goodnight changes as the relationship changes.
- **The first week is the tutorial**, one new mechanic per day (see `MECHANICS.md` §11).
- **The radio stays one-way** (historically accurate for 1915–16). In the air he answers only with panels. **Off duty he answers in writing:**
  - **Morse transcripts:** his pencil log of what you sent, with margin notes
  - **Letters:** the main channel for the relationship. You can write back.
  - **Telephone messages** relayed through the squadron office
  - **Notes and sketches** tucked in with returned supplies

---

## Cast (working)

| Role | Name | Notes |
|---|---|---|
| Player pilot | *TBD* | **A defined character** with his own name, backstory and voice, like Henry in Firewatch. The player chooses how he responds (personal messages, letter replies), not who he is. Young officer, newly posted to the squadron. Has a recognisable **fist**. |
| **The old hand** (Ch. 1 operator) | *TBD* | **Older, steady hand.** A former **Post Office telegraphist**, older than the pilot (30s–40s?). Gruff, dry, quietly protective. Starts as a by-the-book professional who corrects your procedure in the transcript margins, and becomes a mentor, then a friend. He can read a man by his fist. **He teaches you the job: he's the voice of the tutorial**, through panels and transcript corrections. **[VERIFY]** GPO telegraphists serving as RFC/RE wireless operators. |
| **The new lad** (Ch. 2 operator) | *TBD* | **Young and green.** Newly trained, eager, makes mistakes: wrong panels, slow replies, nervous transcripts. **Now you train him**, passing on what the old hand taught you. The mentor becomes the mentored, in reverse. |
| The Major | *TBD* | Squadron commander, gives briefings. Your conscience on fuel and light. |
| Recording Officer | *TBD* | Runs the evening debrief. The "mission control" voice. Hands over phone messages with a raised eyebrow. |
| Fellow pilots | *TBD* | The squadron's other crews. Some won't come back. |

---

## Story delivery

| Channel | When | Carries |
|---|---|---|
| Panels | In flight | Official replies, then small unofficial touches and goodnights |
| Morse transcripts | Morning post | Feedback on your fist and accuracy; small asides |
| Letters | Morning post, triggered by calendar and story state | Backstory, feelings, questions you answer |
| Telephone messages | Debrief | Terse, practical, sometimes bad news |
| Silence | Any time | Something has happened |

Beat types: **calendar** (fixed dates), **conditional** (Rapport, choices, events) and **ambient** (small daily touches). See `MECHANICS.md` §9.4.

## Arc (outline, to be storyboarded)

### Chapter 1: Flanders (1915 → early 1916)
- **Learning to listen.** The first week (tutorial). First contact through panels. Formal and by-the-book at first, then the first unofficial strip.
- **The conversation.** Rapport builds. Personal messages, transcripts with margin notes, the first letters. The Fokker threat. Squadron losses.
- **Chapter turn: goodbye to the old hand.** The squadron is ordered south. His battery stays in Flanders. A last panel, then he's gone from the ground, but not from the post.

### Chapter 2: The Somme (spring → summer/autumn 1916)
- **A new landscape, a new lad.** A fresh generated sector. The new operator is young and green: wrong panels, missed signals, anxious transcripts.
- **Role reversal.** Now *you* are the experienced one. You coach him through margin notes in your replies, patience on the air, and the panel tricks the old hand taught you. The old hand's lessons echo through you.
- **The old hand by letter.** He keeps writing from Flanders, dry advice on "your boy", and the two operators may even swap notes via you. A three-way relationship, no one ever meeting.
- **The build-up.** The bombardment before 1 July 1916. Long days, heavy workload.
- **The offensive.** Contact patrols, the land torn apart, silence from the ground…
- **Ending:** bittersweet separation. **[TBD]** what separates them and what the last message is.

---

## Open story questions

1. **What separates them at the end?** Brainstorming. See the candidate list below.
2. What does his first letter say, and what prompts it?
3. How does the goodnight panel evolve? (First official, then a small twist, then something only you two understand)
4. Names, backgrounds and voice for both leads
5. The framing device: logbook entries, letters, both?
6. Subtitle
7. The pilot's backstory: where he's from, why he flies, who he writes home to
8. What is the old hand's life back home? (wife, children, a Post Office in a small town?) How much does he reveal, and when?
9. Does the old hand ever return to the ground (e.g. posted to the Somme late on), or stay a voice on paper?
10. Does the new lad learn to recognise your fist, the way the old hand did? (A payoff for the mentoring arc)
11. What does the "lesson passed on" look like in play? (The lad starts using the old hand's panel quirks?)

---

## Brainstorm: the ending separation (candidates)

With two operators, the ending can land on either relationship, or both (e.g. the lad's last panel *and* the old hand's last letter).

| # | Idea | What it does |
|---|---|---|
| A | **The pilot is posted home** to instruct new pilots. The last sortie is your final turn west; he lays one last panel. | Survivor's guilt. He stays; you leave. |
| B | **The lad's battery is overrun or shelled** during the offensive. Days of silence, then a letter from a hospital in England. | Fear, then relief. He's safe, out of the war, and gone. |
| C | **The pilot is wounded** on the last flight. You wake to his final transcript, including the last thing you keyed (your fist stumbling). | The fist motif pays off in the transcript. |
| D | **The lad is transferred** to a wireless school to train others. He's grown up, and you made him. A promotion that takes him away. | Quietly bittersweet; nobody is hurt. |
| E | **The new aircraft** (two-seaters with observers) arrive; your machine gets an observer who handles the wireless. You never key to him again. | Historical progress as the thing that separates them. |

## Proposed: the sixpence

The charm hanging under the altimeter is **the old hand's lucky sixpence**, drilled through and strung on signal cord. Proposed, not locked. He gives it to the pilot early in Chapter 1, with a dry line about it having seen more of the war than either of them. It stays on screen for the whole game: it swings in every turn, and it's still there in Chapter 2, long after he's only a voice in letters. One possible payoff: in the ending, the pilot posts it back to him, or it comes back with his last letter. **[VERIFY]** Holed and bent coins carried as soldiers' luck pieces.
