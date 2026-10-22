import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
declare global { interface Window { ultraconnectDesktop?: {toggleFullscreen:()=>Promise<boolean>;isFullscreen:()=>Promise<boolean>}; } }
export function WindowMode(){
 const [full,setFull]=useState(false);
 useEffect(()=>{const update=()=>{if(window.ultraconnectDesktop)void window.ultraconnectDesktop.isFullscreen().then(setFull);else setFull(!!document.fullscreenElement);};update();document.addEventListener('fullscreenchange',update);window.addEventListener('resize',update);return()=>{document.removeEventListener('fullscreenchange',update);window.removeEventListener('resize',update);};},[]);
 async function toggle(){try{if(window.ultraconnectDesktop)setFull(await window.ultraconnectDesktop.toggleFullscreen());else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast.error('Use F11 no computador para alternar tela cheia.');}}
 return <Button variant="ghost" size="icon" aria-label={full?'Modo janela':'Tela cheia'} title={full?'Modo janela':'Tela cheia'} onClick={()=>void toggle()}>{full?<Minimize/>:<Maximize/>}</Button>;
}
