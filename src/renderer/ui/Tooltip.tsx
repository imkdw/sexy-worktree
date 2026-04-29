import { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

export const TooltipProvider = RadixTooltip.Provider;

type Props = { label: string; children: ReactNode };

export function Tooltip({ label, children }: Props): React.JSX.Element {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side="bottom"
          sideOffset={4}
          className="bg-elevated text-text-primary border-border-subtle z-[1500] rounded-sm border px-2 py-1 text-xs"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
