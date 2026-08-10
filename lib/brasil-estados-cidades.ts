/**
 * Lista de estados (UFs) e cidades do Brasil.
 * Usada no wizard de criação de vaga para selects dependentes: País → Estado → Cidade.
 * Quando País !== "Brasil", os campos viram inputs livres.
 */

export type UF = {
  sigla: string;
  nome: string;
  cidades: string[];
};

export const ESTADOS_CIDADES: UF[] = [
  {
    sigla: 'AC',
    nome: 'Acre',
    cidades: [
      'Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá', 'Feijó',
      'Brasileia', 'Plácido de Castro', 'Senador Guiomard', 'Manoel Urbano', 'Santa Rosa do Purus'
    ]
  },
  {
    sigla: 'AL',
    nome: 'Alagoas',
    cidades: [
      'Maceió', 'Arapiraca', 'Rio Largo', 'Penedo', 'União dos Palmares',
      'São Miguel dos Campos', 'Marechal Deodoro', 'Palmeira dos Índios', 'Coqueiro Seco', 'Paripueira'
    ]
  },
  {
    sigla: 'AP',
    nome: 'Amapá',
    cidades: [
      'Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque', 'Mazagão',
      'Porto Grande', 'Tartarugalzinho', 'Vitória do Jari', 'Pedra Branca do Amapari', 'Calçoene'
    ]
  },
  {
    sigla: 'AM',
    nome: 'Amazonas',
    cidades: [
      'Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru', 'Coari',
      'Tefé', 'Tabatinga', 'Manacorí', 'Humaitá', 'São Gabriel da Cachoeira',
      'Presidente Figueiredo', 'Iranduba', 'Lago da Sumaúma', 'Autazes', 'Careiro'
    ]
  },
  {
    sigla: 'BA',
    nome: 'Bahia',
    cidades: [
      'Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Itabuna',
      'Juazeiro', 'Lauro de Freitas', 'Ilhéus', 'Jequié', 'Teixeira de Freitas',
      'Barreiras', 'Alagoinhas', 'Porto Seguro', 'Simões Filho', 'Paulo Afonso',
      'Eunápolis', 'Santo Antônio de Jesus', 'Valença', 'Candeias', 'Guanambi',
      'Barra do Choça', 'Belém do São Francisco', 'Irecê', 'Itaberaba', 'Serrinha',
      'Ribeira do Pombal', 'Bom Jesus da Lapa', 'Catu', 'Ibiúna', 'Senhor do Bonfim'
    ]
  },
  {
    sigla: 'CE',
    nome: 'Ceará',
    cidades: [
      'Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral',
      'Crato', 'Itapipoca', 'Maranguape', 'Iguatu', 'Quixadá',
      'Pacatuba', 'Aquiraz', 'Canindé', 'Russas', 'Limoeiro do Norte',
      'Quixeramobim', 'Aracati', 'Crateús', 'Iguatu', 'Morada Nova'
    ]
  },
  {
    sigla: 'DF',
    nome: 'Distrito Federal',
    cidades: [
      'Brasília', 'Águas Claras', 'Taguatinga', 'Ceilândia', 'Samambaia',
      'Plano Piloto', 'Gama', 'Santa Maria', 'São Sebastião', 'Recanto das Emas',
      'Cruzeiro', 'Samambaia', 'Plano Piloto', 'Park Way', 'Lago Norte'
    ]
  },
  {
    sigla: 'ES',
    nome: 'Espírito Santo',
    cidades: [
      'Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Linhares',
      'Cachoeiro de Itapemirim', 'São Mateus', 'Colatina', 'Guarapari', 'São Bernardo',
      'Aracruz', 'Fundão', 'Iúna', 'Nova Venécia', 'Barra de São Francisco'
    ]
  },
  {
    sigla: 'GO',
    nome: 'Goiás',
    cidades: [
      'Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia',
      'Águas Lindas de Goiás', 'Valparaíso de Goiás', 'Trindade', 'Formosa', 'Novo Gama',
      'Itumbiara', 'Senador Canedo', 'Catalão', 'Jataí', 'Planaltina',
      'Caldas Novas', 'Cristalina', 'Morrinhos', 'Itapirapuã', 'Goianésia'
    ]
  },
  {
    sigla: 'MA',
    nome: 'Maranhão',
    cidades: [
      'São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon', 'Caxias',
      'Codó', 'Paço do Lumiar', 'Açailândia', 'Bacabal', 'Balsas',
      'Santa Inês', 'Pindaré-Mirim', 'Coelho Neto', 'Chapadinha', 'Presidente Dutra',
      'Santa Luzia', 'Viana', 'Codó', 'Raposa', 'Santo Amaro do Maranhão'
    ]
  },
  {
    sigla: 'MT',
    nome: 'Mato Grosso',
    cidades: [
      'Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra',
      'Cáceres', 'Sorriso', 'Lucas do Rio Verde', 'Primavera do Leste', 'Barra do Garças',
      'São Pedro da Cipa', 'Campo Verde', 'Nova Mutum', 'Jaciara', 'Chapada dos Guimarães'
    ]
  },
  {
    sigla: 'MS',
    nome: 'Mato Grosso do Sul',
    cidades: [
      'Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã',
      'Naviraí', 'Nova Andradina', 'Aquidauana', 'Sidrolândia', 'Maracaju',
      'Nova Alvorada do Sul', 'Angélica', 'Rio Brilhante', 'Ivinhema', 'Ampére'
    ]
  },
  {
    sigla: 'MG',
    nome: 'Minas Gerais',
    cidades: [
      'Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim',
      'Montes Claros', 'Ribeirão das Neves', 'Uberaba', 'Governador Valadares', 'Ipatinga',
      'Sete Lagoas', 'Divinópolis', 'Santa Luzia', 'Poços de Caldas', 'Patos de Minas',
      'Teófilo Otoni', 'Pouso Alegre', 'Barbacena', 'Sabará', 'Varginha',
      'Itabira', 'Passos', 'Franca', 'Lavras', 'Três Corações',
      'Alfenas', 'Venda Nova do Imigrante', 'Poço Fundo', 'Caratinga', 'Nova Serrana',
      'Formiga', 'Bom Despacho', 'Lagoa da Prata', 'Brumadinho', 'Nova Lima'
    ]
  },
  {
    sigla: 'PA',
    nome: 'Pará',
    cidades: [
      'Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Castanhal',
      'Parauapebas', 'Abaetetuba', 'Cametá', 'Marituba', 'Bragança',
      'Altamira', 'Paragominas', 'Redenção', 'Tucuruí', 'Portel',
      'Belterra', 'Vitória do Xingu', 'Breves', 'Itaituba', 'Tailandia'
    ]
  },
  {
    sigla: 'PB',
    nome: 'Paraíba',
    cidades: [
      'João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux',
      'Sousa', 'Cajazeiras', 'Sapé', 'Conceição', 'Guarabira',
      'Areia', 'Paraíba', 'Itabaiana', 'Pombal', 'Nova Cruz'
    ]
  },
  {
    sigla: 'PR',
    nome: 'Paraná',
    cidades: [
      'Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel',
      'São José dos Pinhais', 'Foz do Iguaçu', 'Colombo', 'Guarapuava', 'Paranaguá',
      'Araucária', 'Toledo', 'Apucarana', 'Pinhais', 'Campo Largo',
      'Arapongas', 'Almirante Tamandaré', 'Umuarama', 'Maringá', 'Cambé',
      'Piraquara', 'Alvorada do Sul', 'Tijucas do Sul', 'Fazenda Rio Grande', 'Mandirituba'
    ]
  },
  {
    sigla: 'PE',
    nome: 'Pernambuco',
    cidades: [
      'Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina',
      'Paulista', 'Cabo de Santo Agostinho', 'Camaragibe', 'Garanhuns', 'Vitória de Santo Antão',
      'Igarassu', 'São Lourenço da Mata', 'Abreu e Lima', 'Ipojuca', 'Cabo',
      'Santa Cruz do Capibaribe', 'Arcoverde', 'Goiana', 'Surubim', 'Itambé'
    ]
  },
  {
    sigla: 'PI',
    nome: 'Piauí',
    cidades: [
      'Teresina', 'Parnaíba', 'Picos', 'Floriano', 'Campo Maior',
      'Barras', 'União', 'Altos', 'Beneditinos', 'Valença do Piauí'
    ]
  },
  {
    sigla: 'RJ',
    nome: 'Rio de Janeiro',
    cidades: [
      'Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói',
      'Belford Roxo', 'São João de Meriti', 'Campos dos Goytacazes', 'Petrópolis', 'Volta Redonda',
      'Magé', 'Itaboraí', 'Macaé', 'Mesquita', 'Nova Friburgo',
      'Barra Mansa', 'Angra dos Reis', 'Cabo Frio', 'Nilópolis', 'Teresópolis',
      'Casimiro de Abreu', 'Rio das Ostras', 'Silva Jardim', 'Cordeiro', 'Cantagalo'
    ]
  },
  {
    sigla: 'RN',
    nome: 'Rio Grande do Norte',
    cidades: [
      'Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Macaíba',
      'Canguaretama', 'Caicó', 'Açu', 'Currais Novos', 'São José de Mipibu'
    ]
  },
  {
    sigla: 'RS',
    nome: 'Rio Grande do Sul',
    cidades: [
      'Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria',
      'Gravataí', 'Viamão', 'Novo Hamburgo', 'São Leopoldo', 'Rio Grande',
      'Alvorada', 'Passo Fundo', 'Sapucaia do Sul', 'Cachoeirinha', 'Santa Cruz do Sul',
      'Uruguaiana', 'Bagé', 'Bento Gonçalves', 'Erechim', 'Lajeado',
      'Farroupilha', 'Camaquã', 'Gramado', 'Canela', 'Bom Retiro do Sul'
    ]
  },
  {
    sigla: 'RO',
    nome: 'Rondônia',
    cidades: [
      'Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena', 'Cacoal',
      'Rolim de Moura', 'Jaru', 'Guajará-Mirim', 'Ouro Preto do Oeste', 'Pimenta Bueno'
    ]
  },
  {
    sigla: 'RR',
    nome: 'Roraima',
    cidades: [
      'Boa Vista', 'Rorainópolis', 'Caracaraí', 'Pacaraima', 'Alto Alegre',
      'Bonfim', 'Cantá', 'Mucajaí', 'Normandia', 'Camará'
    ]
  },
  {
    sigla: 'SC',
    nome: 'Santa Catarina',
    cidades: [
      'Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Chapecó',
      'Criciúma', 'Itajaí', 'Jaraguá do Sul', 'Lages', 'Palhoça',
      'Balneário Camboriú', 'Brusque', 'Tubarão', 'Sorocaba', 'São Bento do Sul',
      'Camboriú', 'Itapema', 'Navegantes', 'Penha', 'Gaspar'
    ]
  },
  {
    sigla: 'SE',
    nome: 'Sergipe',
    cidades: [
      'Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana', 'São Cristóvão',
      'Estância', 'Tobias Barreto', 'Simão Dias', 'Capela', 'Ribeirópolis'
    ]
  },
  {
    sigla: 'SP',
    nome: 'São Paulo',
    cidades: [
      'São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André',
      'São José dos Campos', 'Osasco', 'Ribeirão Preto', 'Sorocaba', 'Santos',
      'Mauá', 'São José do Rio Preto', 'Mogi das Cruzes', 'Diadema', 'Jundiaí',
      'Piracicaba', 'Carapicuíba', 'Bauru', 'Itaquaquecetuba', 'São Vicente',
      'Franca', 'Marília', 'Taubaté', 'Limeira', 'Ferraz de Vasconcelos',
      'Cotia', 'Praia Grande', 'Guarujá', 'Barueri', 'São José do Rio Preto',
      'Presidente Prudente', 'Araraquara', 'São Carlos', 'Araçatuba', 'Presidente Epitácio',
      'Ribeirão Preto', 'Catanduva', 'Jaú', 'Avaré', 'Botucatu',
      'Ourinhos', 'Assis', 'Lençóis Paulista', 'Macatuba', 'Brotas'
    ]
  },
  {
    sigla: 'TO',
    nome: 'Tocantins',
    cidades: [
      'Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional', 'Paraíso do Tocantins',
      'Colinas do Tocantins', 'Guaraí', 'Tocantinópolis', 'Dianópolis', 'Miracema do Tocantins'
    ]
  }
];

/** Siglas das UFs para validação/autocomplete */
export const SIGLAS_UF = ESTADOS_CIDADES.map((e) => e.sigla);

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
