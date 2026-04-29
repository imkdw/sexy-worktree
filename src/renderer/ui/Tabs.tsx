import { ReactNode } from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "../lib/cn";

const Root = RadixTabs.Root;
const Content = RadixTabs.Content;

function List({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <RadixTabs.List className={cn("border-border-subtle flex gap-3 border-b", className)}>
      {children}
    </RadixTabs.List>
  );
}

function Trigger({ value, children }: { value: string; children: ReactNode }): React.JSX.Element {
  return (
    <RadixTabs.Trigger
      value={value}
      className="text-text-muted data-[state=active]:border-accent data-[state=active]:text-text-primary border-b-2 border-transparent py-2 text-sm"
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export { Root, List, Trigger, Content };
