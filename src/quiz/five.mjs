import { R } from '../compare/metrics.mjs';

export function startingFives(players, games, displayName) {
  const key = (round, opponent, home, scored, conceded) => [round, opponent, home, scored, conceded].join('|');
  const sides = new Map();
  for (const [round, , home, away, homeScore, awayScore, played] of games) {
    if (!played) continue;
    for (const [team, opponent, atHome, scored, conceded] of [
      [home, away, 1, homeScore, awayScore], [away, home, 0, awayScore, homeScore],
    ]) {
      const id = key(round, opponent, atHome, scored, conceded);
      // Ambiguous log keys cannot identify a single scheduled game.
      sides.set(id, sides.has(id) ? null : { round, team, opponent, roster: new Map(), dates: new Set() });
    }
  }
  for (const player of players) {
    for (const row of player.g) {
      const side = sides.get(key(row[R.round], row[R.opp], row[R.home], row[R.ts], row[R.os]));
      if (!side) continue;
      side.dates.add(row[R.date]);
      side.roster.set(String(player.c), { name: displayName(player.n), start: row[R.start] === 1 });
    }
  }
  return [...sides.values()].flatMap(side => {
    if (!side || side.dates.size !== 1) return [];
    const [date] = side.dates;
    const roster = [...side.roster.values()];
    if (!date || roster.length < 6 || roster.filter(player => player.start).length !== 5 ||
      new Set(roster.map(player => player.name)).size !== roster.length) return [];
    return [{ round: side.round, date, team: side.team, opponent: side.opponent,
      roster: roster.sort((a, b) => a.name.localeCompare(b.name, 'en')) }];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.team.localeCompare(b.team));
}
