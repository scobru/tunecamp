import React from "react";
import clsx from '@/utils/clsx';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  iconColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  children?: React.ReactNode; // Action items / Search bars / Controls on the right
  extra?: React.ReactNode;    // Sub-title meta details or badges below title
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
  gradientFrom = "from-primary/20",
  gradientTo = "to-primary/5",
  children,
  extra,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-base-content/5 pb-6 mb-6">
      <div className="flex items-start sm:items-center gap-4">
        {Icon && (
          <div className={clsx(
            "p-3 rounded-2xl bg-gradient-to-br flex-shrink-0 flex items-center justify-center border border-base-content/5 shadow-inner",
            gradientFrom,
            gradientTo,
            iconColor
          )}>
            <Icon size={32} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-prominent truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs lg:text-sm opacity-60 font-medium tracking-normal mt-1">
              {subtitle}
            </p>
          )}
          {extra && <div className="mt-2">{extra}</div>}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto md:justify-end shrink-0">
          {children}
        </div>
      )}
    </div>
  );
};
