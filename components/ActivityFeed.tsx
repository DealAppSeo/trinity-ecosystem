'use client';

import { Card } from '@/components/ui/Card';

interface ActivityItem {
    id: string;
    message: string;
    timestamp: string;
    type: 'info' | 'success' | 'warning';
}

// Mocking activity for now as `signal_events` wasn't fully detailed for this feed, 
// using generic events or passed props. Assuming simpler implementation.
const MOCK_ACTIVITY: ActivityItem[] = [
    { id: '1', message: 'ANTIGRAV optimized build pipeline', timestamp: '10:42 AM', type: 'success' },
    { id: '2', message: 'CLAUDE-3 started sentiment analysis', timestamp: '10:41 AM', type: 'info' },
    { id: '3', message: 'New lead captured from landing page', timestamp: '10:38 AM', type: 'success' },
    { id: '4', message: 'MISTRAL connection latency high', timestamp: '10:35 AM', type: 'warning' },
];

interface ActivityFeedProps {
    className?: string;
}

export function ActivityFeed({ className }: ActivityFeedProps) {
    return (
        <Card className={`p-4 ${className || ''}`} elevated>
            <h3 className="font-bold text-text-primary mb-4 text-sm">System Logs</h3>
            <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {MOCK_ACTIVITY.map((item) => (
                    <div key={item.id} className="flex gap-3 text-xs">
                        <span className="text-text-muted font-mono shrink-0">{item.timestamp}</span>
                        <span className={`${item.type === 'success' ? 'text-status-online' :
                            item.type === 'warning' ? 'text-status-working' :
                                'text-text-secondary'
                            }`}>
                            {item.message}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
}
