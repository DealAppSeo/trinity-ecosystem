import fs from 'fs';
import path from 'path';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Founding Cohort — AI Trinity Symphony',
    description: 'Join the founding cohort of the trust layer for AI.',
};

export default function FoundingPage() {
    const filePath = path.join(process.cwd(), 'docs', 'score', 'aitrinitysymphony_waitlist_v5.html');
    const htmlContent = fs.readFileSync(filePath, 'utf8');

    // Extract content between <body> tags to avoid nested <html> tags
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const headMatch = htmlContent.match(/<head[^>]*>([\s\S]*)<\/head>/i);

    const bodyContent = bodyMatch ? bodyMatch[1] : htmlContent;
    const headContent = headMatch ? headMatch[1] : '';

    return (
        <>
            {/* Injecting head styles/scripts - crude but effective for "dropping it behind" */}
            <div dangerouslySetInnerHTML={{ __html: headContent }} />
            <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
        </>
    );
}
