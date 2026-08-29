interface Props {
  votesA: number
  votesB: number
  labelled?: boolean
}

export function ScoreRail({ votesA, votesB, labelled = true }: Props) {
  const total = votesA + votesB
  const percentA = total ? Math.round((votesA / total) * 100) : 50
  const percentB = 100 - percentA
  return (
    <div aria-label={`Marcador: ${percentA}% contra ${percentB}%`} aria-live="polite">
      {labelled && (
        <div className="mb-2 flex justify-between font-display text-lg font-extrabold tabular-nums text-primary">
          <span>{percentA}%</span><span>{percentB}%</span>
        </div>
      )}
      <div key={`${votesA}-${votesB}`} className="aura-rail score-change" role="img">
        <span className="aura-rail-amber" style={{ flexBasis: `${percentA}%` }} />
        <span className="aura-rail-indigo" style={{ flexBasis: `${percentB}%` }} />
      </div>
    </div>
  )
}
