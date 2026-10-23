import { Button } from '@/components/ui/button';
import { Brand } from './Brand';
import { DeliveryBoard } from './DeliveryBoard';
export function CourierDesk({name,signOut}:{name:string;signOut:()=>Promise<void>}){return <div className="min-h-dvh p-4"><header className="mb-5 flex items-center gap-3 border-b pb-4"><Brand/><div><h1 className="font-bold">Ultraconnect · Entregas</h1><p className="text-sm text-muted-foreground">{name}</p></div><Button className="ml-auto" variant="outline" onClick={()=>void signOut()}>Sair</Button></header><DeliveryBoard courier/></div>;}