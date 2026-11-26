// Φράσεις «σύγκρισης με όλη τη λίγκα» για το Στατιστικό της ημέρας.
// Καθαρές συναρτήσεις με τεστ (test/stat-claims.test.mjs): κάθε φράση πρέπει να ισχύει για τα δεδομένα που παίρνει.

// s = ενεργό σερί του παίκτη, others = ενεργά σερί όλων των άλλων παικτών (ίδιο κριτήριο, π.χ. 20+ πόντοι)
export function streakNote(s, others) {
  const longer = others.filter(k => k > s).length, equal = others.filter(k => k === s).length;
  if (others.every(k => k < s - 1) && s - 1 >= 2) return `Κανείς άλλος στην EuroLeague δεν έχει αυτή τη στιγμή σερί ούτε ${s - 1} αγώνων.`;
  if (longer === 0 && equal === 0) return `Κανείς άλλος στην EuroLeague δεν έχει αυτή τη στιγμή σερί ${s} αγώνων.`;
  if (longer === 0) return equal === 1 ? 'Μόνο ένας ακόμα παίκτης έχει τόσο μεγάλο ενεργό σερί.' : `Μόνο ${equal} ακόμα παίκτες έχουν τόσο μεγάλο ενεργό σερί.`;
  return longer === 1 ? 'Μόνο ένας παίκτης έχει μεγαλύτερο ενεργό σερί.' : `${longer} παίκτες έχουν μεγαλύτερο ενεργό σερί.`;
}

// ενεργό σερί (από τον τελευταίο αγώνα προς τα πίσω) με βάση ένα κριτήριο
export function activeStreak(games, ok) { let k = 0; for (const x of [...games].reverse()) { if (ok(x)) k++; else break; } return k; }
