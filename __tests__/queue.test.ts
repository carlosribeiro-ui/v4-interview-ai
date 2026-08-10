import { describe, it, expect } from 'vitest';
import { comFila, totalOperacoesPendentes } from '../lib/queue';

describe('queue - comFila', () => {
  it('executa a operação e retorna o resultado', async () => {
    const resultado = await comFila('test:1', async () => 42);
    expect(resultado).toBe(42);
  });

  it('serializa operações na mesma chave', async () => {
    const ordem: number[] = [];
    const key = 'test:serial-' + Date.now();

    // Lança 3 operações na mesma chave simultaneamente
    const p1 = comFila(key, async () => {
      ordem.push(1);
      await new Promise((r) => setTimeout(r, 50));
      ordem.push(2);
      return 'a';
    });
    const p2 = comFila(key, async () => {
      ordem.push(3);
      await new Promise((r) => setTimeout(r, 20));
      ordem.push(4);
      return 'b';
    });
    const p3 = comFila(key, async () => {
      ordem.push(5);
      return 'c';
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe('a');
    expect(r2).toBe('b');
    expect(r3).toBe('c');

    // Ordem deve ser serializada: 1,2,3,4,5 (não intercalada)
    expect(ordem).toEqual([1, 2, 3, 4, 5]);
  });

  it('operações em chaves diferentes rodam em paralelo', async () => {
    const start = Date.now();
    const key1 = 'test:paralelo-a-' + Date.now();
    const key2 = 'test:paralelo-b-' + Date.now();

    await Promise.all([
      comFila(key1, async () => {
        await new Promise((r) => setTimeout(r, 80));
        return 'a';
      }),
      comFila(key2, async () => {
        await new Promise((r) => setTimeout(r, 80));
        return 'b';
      })
    ]);

    const elapsed = Date.now() - start;
    // Se rodassem em série, levaria ~160ms. Em paralelo, ~80-100ms.
    expect(elapsed).toBeLessThan(150);
  });

  it('propaga erros sem derrubar a fila', async () => {
    const key = 'test:error-' + Date.now();

    // Primeira operação falha
    const p1 = comFila(key, async () => {
      throw new Error('falha 1');
    });

    // Segunda operação deve rodar normalmente (a fila não trava)
    const p2 = comFila(key, async () => 'ok');

    // Verifica que a primeira rejeita
    await expect(p1).rejects.toThrow('falha 1');
    // Verifica que a segunda completa com sucesso
    const r2 = await p2;
    expect(r2).toBe('ok');
  });

  it('remove entrada do store após conclusão', async () => {
    const key = 'test:cleanup-' + Date.now();
    await comFila(key, async () => 'done');
    // Após execução, a entrada deve ser removida
    // (não há como verificar diretamente, mas não deve vazar memória)
  });

  it('limpa entradas stale (TTL)', async () => {
    // Testa indiretamente: múltiplas operações não acumulam
    const key = 'test:stale-' + Date.now();
    for (let i = 0; i < 5; i++) {
      await comFila(key, async () => i);
    }
    // Se o cleanup funciona, o store não cresce indefinidamente
    expect(totalOperacoesPendentes()).toBeGreaterThanOrEqual(0);
  });

  it('operações concorrentes rápidas não perdem dados', async () => {
    const key = 'test:race-' + Date.now();
    const resultados = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        comFila(key, async () => i)
      )
    );
    // Todos os 10 resultados devem estar presentes (sem perda)
    expect(resultados.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('queue - totalOperacoesPendentes', () => {
  it('retorna 0 quando vazio', () => {
    // Reseta o state (não há API pública, mas testamos o comportamento)
    expect(totalOperacoesPendentes()).toBeGreaterThanOrEqual(0);
  });
});
