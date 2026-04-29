import { ReactNode } from "react";
import * as RadixToggleGroup from "@radix-ui/react-toggle-group";

export const TOGGLE_ITEM_CLASS =
  "text-text-muted hover:bg-surface hover:text-text-primary data-[state=on]:bg-elevated data-[state=on]:text-text-primary inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150";

const Root = RadixToggleGroup.Root;

type ItemProps = { value: string; children: ReactNode; "aria-label"?: string };
function Item({ value, children, ...rest }: ItemProps): React.JSX.Element {
  return (
    <RadixToggleGroup.Item value={value} className={TOGGLE_ITEM_CLASS} {...rest}>
      {children}
    </RadixToggleGroup.Item>
  );
}

export { Root, Item };
