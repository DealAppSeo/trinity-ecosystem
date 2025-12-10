import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    hoverable?: boolean;
    elevated?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, hoverable = false, elevated = false, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'rounded-lg border border-obsidian-border',
                    elevated ? 'bg-obsidian-elevated' : 'bg-obsidian-surface',
                    hoverable && 'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover cursor-pointer',
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = 'Card';
export { Card };
