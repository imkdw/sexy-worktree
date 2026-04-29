import { ReactNode } from "react";
import * as RadixLabel from "@radix-ui/react-label";

type Props = { htmlFor: string; children: ReactNode };

export function Label({ htmlFor, children }: Props): React.JSX.Element {
  return (
    <RadixLabel.Root
      htmlFor={htmlFor}
      className="text-text-muted text-xs tracking-[0.04em] uppercase"
    >
      {children}
    </RadixLabel.Root>
  );
}
