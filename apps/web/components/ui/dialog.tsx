'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const contentVariants = {
  // Create/edit forms slide in from the right and use the full height of the screen.
  sheet:
    'inset-y-0 right-0 flex h-full w-full flex-col gap-6 overflow-y-auto border-l bg-background px-6 pt-6 shadow-2xl sm:max-w-xl sm:px-8 sm:pt-8 lg:max-w-2xl [&>form]:flex [&>form]:flex-1 [&>form]:flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-50 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300 ease-[var(--ease-out)]',
  wide:
    'inset-y-0 right-0 flex h-full w-full flex-col gap-6 overflow-y-auto border-l bg-background px-6 pt-6 shadow-2xl sm:max-w-2xl sm:px-8 sm:pt-8 lg:max-w-4xl [&>form]:flex [&>form]:flex-1 [&>form]:flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-50 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300 ease-[var(--ease-out)]',
  // Large centered writing surface (note editor); add `focus` styles via className for full screen.
  editor:
    'left-1/2 top-1/2 flex h-[min(92vh,1200px)] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition-[max-width,height,border-radius] duration-300 ease-[var(--ease-out)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] sm:w-[calc(100%-3rem)]',
  center:
    'left-[50%] top-[50%] grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border bg-background p-6 shadow-2xl duration-300 ease-[var(--ease-out)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-[48%]',
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean; variant?: keyof typeof contentVariants }
>(({ className, children, hideClose, variant = 'sheet', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content ref={ref} className={cn('fixed z-50', contentVariants[variant], className)} {...props}>
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-6 sm:top-6 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 pr-8 text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

/** In a side sheet the footer sticks to the bottom edge while the form scrolls. */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'sticky bottom-0 -mx-6 !mt-auto flex flex-col-reverse gap-2 border-t bg-background/90 px-6 py-4 backdrop-blur sm:-mx-8 sm:flex-row sm:justify-end sm:px-8',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-xl font-semibold leading-none tracking-tight', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
