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
      'fixed inset-0 z-50 bg-black/20 backdrop-blur-[3px] duration-500 ease-ds data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const contentVariants = {
  // Create/edit forms slide in from the right and use the full height of the screen.
  // Floating side sheet (design system "Sheet"): inset 12 px, radius 22, menu glass.
  sheet: 'inset-y-0 right-0 flex h-full w-full flex-col gap-6 overflow-y-auto ds-menu px-6 pt-6 sm:inset-y-3 sm:right-3 sm:h-auto sm:rounded-2xl sm:px-7 sm:pt-7 [&>form]:flex [&>form]:flex-1 [&>form]:flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-50 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-700 ease-ds sm:max-w-xl lg:max-w-2xl',
  wide: 'inset-y-0 right-0 flex h-full w-full flex-col gap-6 overflow-y-auto ds-menu px-6 pt-6 sm:inset-y-3 sm:right-3 sm:h-auto sm:rounded-2xl sm:px-7 sm:pt-7 [&>form]:flex [&>form]:flex-1 [&>form]:flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-50 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-700 ease-ds sm:max-w-2xl lg:max-w-4xl',
  // Large centered writing surface (note editor); add `focus` styles via className for full screen.
  editor:
    'ds-menu left-1/2 top-1/2 flex h-[min(92vh,1200px)] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl transition-[max-width,height,border-radius] duration-500 ease-ds data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] sm:w-[calc(100%-3rem)]',
  center:
    'ds-menu left-[50%] top-[50%] grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl p-6 duration-500 ease-ds data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-top-[49%]',
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
        <DialogPrimitive.Close className="group/close absolute right-4 top-4 flex h-[22px] w-[22px] items-center justify-center rounded-full text-foreground transition-colors duration-500 ease-ds hover:bg-accent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:right-5 sm:top-5 disabled:pointer-events-none">
          <X className="h-[13px] w-[13px] transition-transform duration-500 ease-ds group-hover/close:rotate-90" strokeWidth={1.6} />
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
      'sticky bottom-0 -mx-6 !mt-auto flex flex-col-reverse gap-1.5 border-t bg-popover px-6 py-4 sm:-mx-7 sm:flex-row sm:justify-end sm:px-7',
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
  <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold leading-tight tracking-[-0.01em]', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-[13px] leading-[1.55] text-[hsl(var(--fg-2)/var(--fg-2-a))]', className)} {...props} />);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
