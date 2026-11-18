# Source map and further craft reading

This guide synthesizes Archie's own material and selected teaching resources from the saved ten-course library. It is an original project application, not a reproduction of a course or a claim that every linked recording and assigned book has been read. Course indexes include duplicated package assets and externally hosted readings. Read the relevant teaching text when a task needs deeper support; do not treat an index entry as evidence of a specific teaching.

All paths here are relative to this reference. Start with the [library index](../../../research/story-writing-courses/README.md) for access and attribution notices. MIT's modern packages use `materials/pages/` and `materials/static_resources/`; Yale has searchable `transcripts/`. Sanderson's folder contains publisher links, not local lecture notes. Use the provider source when those notes are needed, and distinguish newly researched material from this local synthesis. Preserve source notices; do not copy student work or course readings into game text.

## Project sources

| Source | What it governs |
|---|---|
| [Story workshop](../../../docs/story/README.md) | Current crew decisions, open alternatives, seeds; precedence over older drafts |
| [Story bible](../../../docs/STORY.md) | Campaign context, delivery, tone, legacy options, explicit sixpence continuity |
| [Cast workshop](../../../docs/story/CHARACTERS.md) | Working certainty question, relationships, possible turning points |
| [Character skills index](../../../docs/STORY.md#current-cast-and-writing-references) | The four opening dossiers and existing voice skills; read the relevant pair directly |
| [Mechanics](../../../docs/MECHANICS.md) | Judgement, assisted Morse, channels, day structure, failure, conditional beats, rapport, accessibility; current-crew warning applies |
| [Rook Field](../../../docs/AERODROME.md) | The solitary desk, readable artifacts, current controls and implementation limits |
| [Historical ledger](../../../docs/HISTORICAL_RESEARCH.md) | Supported period details and precise limits of the evidence |
| [Trenches](../../../docs/TRENCHES.md) and [open questions](../../../docs/QUESTIONS.md) | Environmental constraints and unsettled presentation/design; not new narrative canon |

## Teaching resources and their use

| Saved resource | Read for | Application in this skill |
|---|---|---|
| [01 · MIT Interactive Narrative](../../../research/story-writing-courses/01-interactive-narrative/README.md), especially [Assignments](../../../research/story-writing-courses/01-interactive-narrative/materials/assignments) | Nonlinear flow, navigation, narrative projects across media | Design the route through information together with the writing; make choices lead to an intelligible next encounter |
| [02 · MIT Genre Fiction Workshop](../../../research/story-writing-courses/02-genre-fiction/README.md), Shariann Lewitt, Class 3, Class 4, Class 7 and Workshopping notes | Reader expectations, fair revelation, interdependence of world/plot/character, structural critique before language | Honour the story-game promise; establish evidence before its payoff; diagnose the larger cause before polishing |
| [03 · MIT Writing and Reading Short Stories](../../../research/story-writing-courses/03-short-stories/README.md), Shariann Lewitt, sessions 4, 6, 14 and point-of-view exercise | Emotional truth, character desire and revelation, selective detail, viewpoint | Make feeling credible in a particular moment; distinguish knowing a character from revealing them to the player |
| [04 · MIT Playwriting I](../../../research/story-writing-courses/04-playwriting/README.md), Laura Harrington, objects/week 2, plot/week 3, revision/week 10 | Objects changing meaning, linked decisions, urgency, distinct voices | Make scenes cause other scenes; use physical handling and exchange; revise what the characters do as well as what they say |
| [05 · Sanderson lecture index](../../../research/story-writing-courses/05-sanderson/README.md) | Optional further reading on plot, structure, character agency and development, Earth-based worldbuilding | A route for deeper research; no specific lecture framework is asserted here on the strength of the index alone |
| [06 · MIT Writing Workshop](../../../research/story-writing-courses/06-writing-workshop/README.md), Jessica Young, [calendar](../../../research/story-writing-courses/06-writing-workshop/materials/pages/calendar-and-assignments/index.html), sessions 8–9 microfiction | Short forms, compression, revision | A margin note can suggest a complete human event; brevity should retain enough context for comprehension |
| [07 · MIT Writing and Experience](../../../research/story-writing-courses/07-writing-and-experience/README.md), [Assignments](../../../research/story-writing-courses/07-writing-and-experience/materials/pages/assignments/index.html) | Identity through specific experiences, family, ritual, place, artifacts, audience | Give civilian life independent substance; let an experience suggest meaning without forcing it to illustrate a thesis |
| [08 · MIT Technologies of Humanism](../../../research/story-writing-courses/08-technologies-of-humanism/README.md), Kurt Fendt, [Projects](../../../research/story-writing-courses/08-technologies-of-humanism/materials/pages/projects/index.html) | Medium, multiple readings, navigation, reader participation | Choose channels for their expressive limits; an interactive adaptation should change experience, not just add buttons |
| [09 · Yale American Novel](../../../research/story-writing-courses/09-american-novel/README.md), Amy Hungerford, [lecture 11 transcript](../../../research/story-writing-courses/09-american-novel/transcripts/11.txt) | Barth, narrative convention, inherited stories, the source of a narrator's knowledge | Interrogate who can tell an event and where their account came from; conventional structure is a tool, not an obligation |
| [10 · MIT Game Design](../../../research/story-writing-courses/10-game-design/README.md), Philip B. Tan and Jason Begy, [Assignments](../../../research/story-writing-courses/10-game-design/materials/pages/assignments/index.html) | Legibility, learnable rules, constrained prototypes, playtests and iteration | Test the actual decision and its comprehension in a small walkthrough before expanding the content |

The workshop also links Scriptnotes discussions of wants, agency, and dramatic argument. Those are further-reading pointers; open the source before quoting or attributing a specific claim. Their presence does not prescribe a fixed act structure for Archie.

## Finding the original local handouts

Use the course's own index or filename search instead of keeping copied lecture text here. Examples from the repo root:

```sh
rg --files research/story-writing-courses/02-genre-fiction/materials/static_resources | rg 'Class_[347]|Workshopping'
rg --files research/story-writing-courses/03-short-stories/materials/static_resources | rg 'ses4|ses6|ses14|pov'
rg --files research/story-writing-courses/04-playwriting/materials/static_resources | rg 'objects_wk2|handout_wk3|handout_wk10'
```

Use a PDF text reader for text handouts; inspect the page itself when layout or a diagram matters. Package dates can differ from dates printed in reused handouts: the 2012 short-story package includes notes labelled Fall 2006. Preserve that distinction when citing them.

The techniques in the other references are Archie-specific recommendations. In particular, the branch fallbacks, continuity ledger, and ending checks are applications to this game's constraints, not claims that a course supplied those exact procedures.
