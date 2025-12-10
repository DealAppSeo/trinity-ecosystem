import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center font-medium rounded-md transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

        const variants = {
            primary: 'bg-accent-violet hover:bg-accent-violet-hover text-white active:scale-[0.98]',
            secondary: 'bg-transparent border border-obsidian-border hover:border-obsidian-border-focus text-text-primary',
            ghost: 'bg-transparent hover:bg-obsidian-elevated text-text-secondary hover:text-text-primary',
        };

        const sizes = {
            sm: 'text-sm py-2 px-4',
            md: 'text-base py-3 px-6',
            lg: 'text-lg py-4 px-8',
        };

        return (
            <button
                ref={ref}
                className={cn(baseStyles, variants[variant], sizes[size], className)}
                {...props}
            >
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
export { Button };
