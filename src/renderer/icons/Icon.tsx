import type { LucideIcon, LucideProps } from "lucide-react";

export type { LucideIcon };

type IconProps = {
  icon: LucideIcon;
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
};

export function Icon({
  icon: LucideComponent,
  size = 16,
  className,
  ...rest
}: IconProps): React.JSX.Element {
  const props: LucideProps = { width: size, height: size, strokeWidth: 1.5, className, ...rest };
  return <LucideComponent {...props} />;
}
