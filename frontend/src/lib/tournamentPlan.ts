export function tournamentPlan(participants: number, durationSeconds: number, pauseSeconds = 20) {
  const count = Math.max(0, Math.floor(participants))
  const slots = count < 2 ? 0 : 2 ** Math.ceil(Math.log2(count))
  const matches = count < 2 ? 0 : count - 1 + (count >= 4 ? 1 : 0)
  return {
    slots,
    byes: slots ? slots - count : 0,
    rounds: slots ? Math.log2(slots) : 0,
    matches,
    estimatedSeconds: matches * durationSeconds + Math.max(0, matches - 1) * pauseSeconds,
  }
}

export function suggestedMatchDuration(participants: number, targetMinutes: number, pauseSeconds = 20) {
  const { matches } = tournamentPlan(participants, 90, pauseSeconds)
  if (!matches) return 90
  const available = targetMinutes * 60 - Math.max(0, matches - 1) * pauseSeconds
  return Math.max(30, Math.min(180, Math.round(available / matches / 5) * 5))
}

export function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
