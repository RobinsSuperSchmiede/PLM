import { DotLoader } from '@/components/dot-loader';

/**
 * Shown at once while the next page's code is loading (and, on the dev server, compiling), so a click
 * never looks like nothing happened. The shell with header and rail stays in place around it.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <DotLoader size={28} className="text-muted-foreground duration-300 animate-in fade-in" />
    </div>
  );
}
