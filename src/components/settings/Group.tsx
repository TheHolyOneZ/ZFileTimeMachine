export function Group({ title, description, children, footer }: { title?: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section data-group>
      {title && <h3 className="text-sm font-semibold px-1 mb-2">{title}</h3>}
      <div className="rounded-xl bg-card shadow-card divide-y divide-[hsl(var(--line))] overflow-hidden">{children}</div>
      {description && <p className="text-xs text-faint mt-2 px-1 leading-relaxed">{description}</p>}
      {footer}
    </section>
  );
}

export function Row({ label, description, children, stacked, htmlFor }: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  stacked?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className={`px-4 py-3.5 ${stacked ? 'space-y-3' : 'flex items-center gap-4'}`}>
      <div className="flex-1 min-w-0">
        <label htmlFor={htmlFor} className="block text-sm text-foreground">{label}</label>
        {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {children && <div className={stacked ? '' : 'shrink-0'}>{children}</div>}
    </div>
  );
}
