import logo from '@/assets/ultraconnect-logo.jpeg.asset.json';

export function Brand({ large = false }: { large?: boolean }) {
  return <img src={logo.url} alt="Ultraconnect Sabor e Brasa" className={large ? 'brand-logo mx-auto h-40 w-40 object-contain sm:h-48 sm:w-48' : 'brand-logo h-14 w-14 shrink-0 object-contain'} />;
}