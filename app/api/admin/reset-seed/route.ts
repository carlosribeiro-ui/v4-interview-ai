import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const db = await getDb();
  const col = db.collection('usuarios');
  
  // Delete seed users so they get recreated with new scrypt params
  const result = await col.deleteMany({
    email: { $in: ['admin@v4company.com', 'talent@v4company.com'] }
  });
  
  return NextResponse.json({ 
    ok: true, 
    deleted: result.deletedCount,
    mensagem: 'Seed users deletados. Próximo login vai recriar com novos params.'
  });
}
