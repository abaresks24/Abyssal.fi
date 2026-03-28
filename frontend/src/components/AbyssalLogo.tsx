import Image from 'next/image';

interface Props {
  size?: number;
  className?: string;
}

export function AbyssalLogo({ size = 28, className }: Props) {
  return (
    <Image
      src="/logo.svg"
      alt="Abyssal.fi"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: '50%' }}
    />
  );
}
