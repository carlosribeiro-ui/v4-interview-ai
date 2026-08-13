const TONS = {
  neutro: 'bg-fg/10 text-fg/60',
  vermelho: 'bg-v4red/15 text-v4red',
  verde: 'bg-v4green/15 text-v4green',
  amarelo: 'bg-v4yellow/15 text-v4yellow'
} as const;

/** Badge em formato pill — status/tags curtos (ex: "Concluída", "Privado", "Emprego"). */
export default function Pill({
  children,
  tom = 'neutro'
}: {
  children: React.ReactNode;
  tom?: keyof typeof TONS;
}) {
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${TONS[tom]}`}>
      {children}
    </span>
  );
}
