import { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";

const Root = RadixDialog.Root;

type ContentProps = {
  children: ReactNode;
  size?: "normal" | "wide";
  className?: string;
};

function Content({ children, size = "normal", className }: ContentProps): React.JSX.Element {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm" />
      <RadixDialog.Content
        aria-describedby={undefined}
        className={cn(
          "border-border-subtle bg-surface fixed top-1/2 left-1/2 z-[1000] flex max-w-[95vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border p-6",
          size === "normal" ? "w-modal" : "w-modal-wide",
          className
        )}
      >
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

function Header({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="flex items-center justify-between">{children}</div>;
}

function Title({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <RadixDialog.Title className="text-text-primary text-lg font-semibold">
      {children}
    </RadixDialog.Title>
  );
}

function Description({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <RadixDialog.Description className="text-text-muted text-xs">
      {children}
    </RadixDialog.Description>
  );
}

function Footer({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="flex justify-end gap-3">{children}</div>;
}

function Close(): React.JSX.Element {
  return (
    <RadixDialog.Close asChild>
      <button className="text-text-muted hover:text-text-primary">
        <Icon icon={X} size={16} />
      </button>
    </RadixDialog.Close>
  );
}

export { Root, Content, Header, Title, Description, Footer, Close };
