/**
 * Constantes e helpers compartilhados entre o form de entrevista
 * (app/entrevista/[vagaId]/page.tsx) e os filtros de candidatos (app/candidatos/page.tsx) —
 * fonte única pra manter os dois em sincronia.
 */

/** Nível de formação + situação combinados num valor só — padrão Gupy/Catho. */
export const OPCOES_FORMACAO: [string, string][] = [
  ['medio-incompleto', 'Ensino Médio Incompleto'],
  ['medio-completo', 'Ensino Médio Completo'],
  ['tecnico-incompleto', 'Técnico Incompleto'],
  ['tecnico-completo', 'Técnico Completo'],
  ['superior-incompleto', 'Superior Incompleto'],
  ['superior-completo', 'Superior Completo'],
  ['pos-incompleto', 'Pós-graduação Incompleto'],
  ['pos-completo', 'Pós-graduação Completo'],
  ['mestrado-incompleto', 'Mestrado Incompleto'],
  ['mestrado-completo', 'Mestrado Completo'],
  ['doutorado-incompleto', 'Doutorado Incompleto'],
  ['doutorado-completo', 'Doutorado Completo']
];

export const OPCOES_IDIOMA: [string, string][] = [
  ['portugues', 'Português'],
  ['ingles', 'Inglês'],
  ['espanhol', 'Espanhol'],
  ['frances', 'Francês'],
  ['alemao', 'Alemão'],
  ['outro', 'Outro']
];

/** Remove tudo que não é dígito ou "+" no início — bloqueia letras no telefone. */
export function limparTelefone(input: string): string {
  const mais = input.trim().startsWith('+') ? '+' : '';
  return mais + input.replace(/[^\d]/g, '');
}

/**
 * Formata progressivamente como telefone BR enquanto digita: (11) 99999-9999 ou (11) 9999-9999.
 * Números com "+" (internacional) ou muitos dígitos não são forçados no molde BR — só limpa letras.
 */
export function formatarTelefone(input: string): string {
  const limpo = limparTelefone(input);
  if (limpo.startsWith('+') || limpo.length > 11) return limpo;

  const d = limpo;
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/** Válido = pelo menos 8 dígitos (cobre fixo/celular BR de 10-11 e a maioria dos formatos internacionais). */
export function telefoneValido(input: string): boolean {
  const digitos = input.replace(/[^\d]/g, '');
  return digitos.length >= 8;
}

/** Checagem leve de formato — não valida se o perfil existe, só se "parece" um link/handle do LinkedIn. */
export function linkedinValido(input: string): boolean {
  const v = input.trim().toLowerCase();
  return v.length >= 3 && (v.includes('linkedin.com/') || /^[\w.-]+$/.test(v));
}

/**
 * Máscara de moeda BRL — digita só números, formata como "R$ 1.234,56" em tempo real
 * (últimos 2 dígitos = centavos, igual campo de valor de qualquer banco/e-commerce).
 */
export function formatarMoedaBRL(input: string): string {
  const digitos = input.replace(/\D/g, '');
  if (!digitos) return '';
  const centavos = parseInt(digitos, 10);
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
