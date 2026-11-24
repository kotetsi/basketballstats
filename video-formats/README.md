# BasketballStats Video Format Library

Defines **what** videos basketballstats.eu produces: 30 recurring shows and formats, each with its editorial concept, data requirements, validation rules, script structure, visual plan and narration style. The [Video Factory](../video-factory/) defines **how** they are produced.

A format turns real data into a **production request**: a Video Factory story of type `format` with its data, scene plan and scripts for every duration. The Factory renders it without format-specific code.

## Γρήγορα (ελληνικά)

```bash
node video-factory/dashboard/server.mjs     # http://127.0.0.1:4318/  →  «Format Library →»
node video-formats/src/cli.mjs list         # όλα τα formats: διαθέσιμο / τι δεδομένα λείπουν
node video-formats/src/cli.mjs generate statistical-twin
node video-formats/src/cli.mjs calendar days=14
node --test video-formats/test/*.test.mjs
```

Στη σελίδα **Format Library**:
- **Library:** διαθεσιμότητα και spec κάθε format, ενεργοποίηση/απενεργοποίηση, ρυθμίσεις (διάρκεια, ύφος, θέμα, πλήθος, κριτήρια).
- **Generate:** αιτήματα παραγωγής με βαθμολογία και σενάριο. Από εκεί **Approve production request** (το αίτημα πάει στο Video Factory) ή **Preview sample video**.
- **Editorial calendar:** προτάσεις για τις επόμενες 3 εβδομάδες, εβδομαδιαίες εκπομπές, χειροκίνητος προγραμματισμός.
- **Performance:** σύγκριση των formats από τις μετρήσεις που περνάς στο Video Factory.

Τίποτα δεν δημοσιεύεται αυτόματα.

## Status (data through round 13, November 2026)

| | Formats |
|---|---|
| **Functional (24)** | The Numbers Don't Lie, Statistical Twin, The Stat Paradox, The Clutch Report, The Efficiency Trap, The Shot Diet, Prediction vs Reality, The Underrated Player, The Future Stars, The Player Transformation, The Team DNA, The Bench Effect, The Matchup Lab, Guess the Player, Basketball IQ Test, Who Would You Pick?, Rank These Players, The Data Challenge, Basketball Time Machine, One Season in 60 Seconds, The Impossible Record, Basketball Stock Market, The Home Court Myth, The Basketball Daily Show |
| **Planned: data available, builder not written (2)** | The Statistical Court, The Rotation Lab |
| **Missing data (4)** | Agree or Disagree? (editorial claims queue), What Happened Next? (careers outside EuroLeague), The Perfect Team (Fantasy squad size and position rules), The Basketball World Ranking (multi-competition data) |

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): integration with the Video Factory, request contract, scene kit, adding a format
- [docs/FORMATS.md](docs/FORMATS.md): all 30 formats (concept, data, validation, structure, visuals, voice, frequency, example)
- [docs/DATA.md](docs/DATA.md): dataset catalog, availability checks, missing data and how to unlock each format
- [docs/EDITORIAL.md](docs/EDITORIAL.md): opportunity score, editorial calendar, performance analytics, quality rules
