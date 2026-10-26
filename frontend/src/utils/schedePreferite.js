// ============================================
// GymMaster — Favorite plans in the lists
// ============================================

/** The plans with the favorites first; each group keeps the order it had */
export function primaLePreferite(schede, preferite) {
  return [...schede.filter(s => preferite.has(s.id)), ...schede.filter(s => !preferite.has(s.id))];
}
