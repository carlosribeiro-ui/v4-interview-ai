/**
 * Sanitização de input para prevenir XSS e prompt injection.
 * Remove tags HTML/script e limita tamanho de campos de texto.
 */

/** Remove tags HTML e scripts de uma string. Preserva texto puro. */
export function stripHtml(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/** Sanitiza campo de texto livre — strip HTML + truncation. */
export function sanitizarTexto(input: string, maxLength = 5000): string {
  return stripHtml(input).slice(0, maxLength);
}

/** Sanitiza campo de texto curto (nome, cargo, etc). */
export function sanitizarCurto(input: string, maxLength = 200): string {
  return stripHtml(input).trim().slice(0, maxLength);
}

/**
 * Detecta padrões suspeitos de prompt injection em texto do usuário.
 * Retorna true se detectar padrão suspeito.
 */
export function detectarPromptInjection(input: string): boolean {
  const padroes = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+(all\s+)?above/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /system\s*:\s*/i,
    /act\s+as\s+if/i,
    /pretend\s+you\s+are/i,
    /disregard\s+(all\s+)?prior/i,
    /\[INST\]/i,
    /<<SYS>>/i,
    /<\|im_start\|>/i,
  ];
  return padroes.some((p) => p.test(input));
}

/** Limita tamanho de job description para prevenir abuso de tokens no Gemini. */
export function sanitizarJobDescription(input: string): string {
  return sanitizarTexto(input, 10_000);
}
