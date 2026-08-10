/**
 * Estados (UFs) e cidades do Brasil via API do IBGE.
 * - UFs: lista estática (27 itens, imutável)
 * - Cidades: fetch dinâmico da API oficial IBGE (todas as 5.570+ municípios)
 * https://servicodados.ibge.gov.br/api/v1/localidades
 *
 * Usada no wizard de criação de vaga para selects dependentes: País → Estado → Cidade.
 * Quando País !== "Brasil", os campos viram inputs livres.
 */

export type UF = {
  id: number;
  sigla: string;
  nome: string;
};

export type Cidade = {
  id: number;
  nome: string;
};

/** 27 UFs do Brasil — estática, não precisa de fetch. */
export const UFS: UF[] = [
  { id: 11, sigla: 'RO', nome: 'Rondônia' },
  { id: 12, sigla: 'AC', nome: 'Acre' },
  { id: 13, sigla: 'AM', nome: 'Amazonas' },
  { id: 14, sigla: 'RR', nome: 'Roraima' },
  { id: 15, sigla: 'PA', nome: 'Pará' },
  { id: 16, sigla: 'AP', nome: 'Amapá' },
  { id: 17, sigla: 'TO', nome: 'Tocantins' },
  { id: 21, sigla: 'MA', nome: 'Maranhão' },
  { id: 22, sigla: 'PI', nome: 'Piauí' },
  { id: 23, sigla: 'CE', nome: 'Ceará' },
  { id: 24, sigla: 'RN', nome: 'Rio Grande do Norte' },
  { id: 25, sigla: 'PB', nome: 'Paraíba' },
  { id: 26, sigla: 'PE', nome: 'Pernambuco' },
  { id: 27, sigla: 'AL', nome: 'Alagoas' },
  { id: 28, sigla: 'SE', nome: 'Sergipe' },
  { id: 29, sigla: 'BA', nome: 'Bahia' },
  { id: 31, sigla: 'MG', nome: 'Minas Gerais' },
  { id: 32, sigla: 'ES', nome: 'Espírito Santo' },
  { id: 33, sigla: 'RJ', nome: 'Rio de Janeiro' },
  { id: 35, sigla: 'SP', nome: 'São Paulo' },
  { id: 41, sigla: 'PR', nome: 'Paraná' },
  { id: 42, sigla: 'SC', nome: 'Santa Catarina' },
  { id: 43, sigla: 'RS', nome: 'Rio Grande do Sul' },
  { id: 50, sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { id: 51, sigla: 'MT', nome: 'Mato Grosso' },
  { id: 52, sigla: 'GO', nome: 'Goiás' },
  { id: 53, sigla: 'DF', nome: 'Distrito Federal' }
];

/** Cache em mémria pra não re-buscar o mesmo estado. */
const cacheCidades = new Map<string, Cidade[]>();

/**
 * Busca todas as cidades de um estado via API do IBGE.
 * Resultado é cacheado em memória por UF.
 *
 * GET https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios
 * Retorna array de { id, nome, microrregiao: { id, nome, mesorregiao: { ... } } }
 */
export async function fetchCidades(uf: string): Promise<Cidade[]> {
  const chave = uf.toUpperCase();
  if (cacheCidades.has(chave)) return cacheCidades.get(chave)!;

  const res = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${chave}/municipios`
  );

  if (!res.ok) {
    console.error(`[IBGE] Erro ao buscar cidades de ${chave}: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const cidades: Cidade[] = data
    .map((m: any) => ({ id: m.id, nome: m.nome }))
    .sort((a: Cidade, b: Cidade) => a.nome.localeCompare(b.nome, 'pt-BR'));

  cacheCidades.set(chave, cidades);
  return cidades;
}

/** Países comuns para o select (Brasil primeiro) */
export const PAISES = [
  { value: 'Brasil', label: 'Brasil' },
  { value: 'Estados Unidos', label: 'Estados Unidos' },
  { value: 'Portugal', label: 'Portugal' },
  { value: 'Argentina', label: 'Argentina' },
  { value: 'Colômbia', label: 'Colômbia' },
  { value: 'Chile', label: 'Chile' },
  { value: 'México', label: 'México' },
  { value: 'Reino Unido', label: 'Reino Unido' },
  { value: 'Alemanha', label: 'Alemanha' },
  { value: 'Espanha', label: 'Espanha' },
  { value: 'França', label: 'França' },
  { value: 'Canadá', label: 'Canadá' },
  { value: 'Austrália', label: 'Austrália' },
  { value: 'Japão', label: 'Japão' },
  { value: 'China', label: 'China' },
  { value: 'Outro', label: 'Outro' }
];
