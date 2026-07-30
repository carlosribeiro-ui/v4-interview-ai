function corPorScore(score: number) {
  if (score >= 7) return '#52CC5A'; // v4green
  if (score >= 4) return '#FFC02A'; // v4yellow
  return '#E50914'; // v4red
}

/** Anel de progresso circular usado pra score — assinatura visual dos cards de candidato. */
export default function ScoreRing({
  score,
  size = 44,
  strokeWidth = 4
}: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score !== null ? Math.max(0, Math.min(10, score)) / 10 : 0;
  const offset = circumference * (1 - pct);
  const cor = score !== null ? corPorScore(score) : 'rgba(255,255,255,0.15)';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {score !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={cor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold" style={{ color: score !== null ? cor : 'rgba(255,255,255,0.4)' }}>
          {score !== null ? score.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  );
}
