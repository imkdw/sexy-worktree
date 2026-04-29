import { ReactNode } from "react";
import * as RadixToggle from "@radix-ui/react-toggle";
import { TOGGLE_ITEM_CLASS } from "./ToggleGroup";

type Props = {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  "aria-label"?: string;
};

export function Toggle({ pressed, onPressedChange, children, ...rest }: Props): React.JSX.Element {
  return (
    <RadixToggle.Root
      pressed={pressed}
      onPressedChange={onPressedChange}
      className={TOGGLE_ITEM_CLASS}
      {...rest}
    >
      {children}
    </RadixToggle.Root>
  );
}
