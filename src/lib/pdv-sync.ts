import type { State } from './pdv-store';
export type SharedSnapshot = {data:unknown; revision:number};
export function mergeSnapshot(current:State, snapshot:SharedSnapshot, revision:number):State|null {
 if(snapshot.revision<=revision)return null;
 if(!snapshot.data || typeof snapshot.data!=='object')return null;
 const data=snapshot.data as Partial<State>;
 if(!Array.isArray(data.orders)||!Array.isArray(data.products)||!data.settings||!data.cash||typeof data.nextNumber!=='number')return null;
 return {...data as State,draft:current.draft};
}
