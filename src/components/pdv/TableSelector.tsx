import { Button } from '@/components/ui/button';
import { TABLES } from '@/lib/pdv-tables';
import { Armchair } from 'lucide-react';
export function TableSelector({ value, onChange }: { value?: number | undefined; onChange: (n:number) => void }) {
  return <div className="my-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Escolher mesa">{TABLES.map(n => <Button key={n} aria-label={`Mesa ${n}`} aria-pressed={value===n} variant={value===n?'default':'outline'} className="h-14 flex-col gap-1 px-1" onClick={() => onChange(n)}><Armchair/><span className="text-xs">{n}</span></Button>)}</div>;
}