'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:ds-menu group-[.toaster]:rounded-[16px] group-[.toaster]:border-0 group-[.toaster]:text-[13px] group-[.toaster]:font-sans',
          title: 'group-[.toast]:font-semibold',
          description: 'group-[.toast]:text-xs group-[.toast]:text-[hsl(var(--fg-2)/var(--fg-2-a))]',
          actionButton: 'group-[.toast]:!rounded-full group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground',
          cancelButton: 'group-[.toast]:!rounded-full group-[.toast]:!bg-transparent group-[.toast]:!text-foreground',
          error: 'group-[.toaster]:[&_[data-icon]]:text-destructive',
          success: 'group-[.toaster]:[&_[data-icon]]:text-success',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
