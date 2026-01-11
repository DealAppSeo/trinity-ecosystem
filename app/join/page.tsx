'use client';

import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function JoinPage() {
    const [pin, setPin] = useState('');
    const [step, setStep] = useState<'auth' | 'details'>('auth');
    const [formData, setFormData] = useState({
        email: '',
        name: '',
        role: 'Developer',
        company: '',
        referral_source: 'Twitter/X',
        hasApp: false,
        contribution: ''
    });
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handlePinSubmit = () => {
        if (pin === '7777') {
            router.push('/pulse/conductor');
        } else {
            alert('Invalid Access Code');
        }
    };

    const handleDetailsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Insert into real leads table
        const { error } = await supabase.from('leads').insert([{
            email: formData.email,
            name: formData.name,
            role: formData.role,
            company: formData.company,
            referral_source: formData.referral_source,
            referral_detail: formData.contribution,
            wants_ecosystem_consideration: formData.hasApp
        }]);

        setLoading(false);

        if (error) {
            alert('Error submitting details: ' + error.message);
        } else {
            // Success - Redirect to Pulse (or show success state)
            // For this flow, we'll store a flag and redirect
            // In a real app, we'd trigger the email invite here
            localStorage.setItem('trinity_access', 'true');
            router.push('/pulse/watch');
        }
    };

    const handleGithubLogin = async () => {
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo: `${window.location.origin}/pulse/conductor`
            }
        });
        if (error) {
            alert('GitHub Login Failed: ' + error.message);
            setLoading(false);
        }
    };

    // Step 1: Frictionless Auth Choices
    if (step === 'auth') {
        return (
            <div className="min-h-screen bg-obsidian-base">
                <Header title="JOIN TRINITY" />
                <main className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[calc(100vh-64px)]">
                    <Card className="max-w-md w-full p-8" elevated>
                        <div className="text-center mb-8">
                            <div className="text-4xl mb-4">💎</div>
                            <h2 className="text-2xl font-bold text-text-primary mb-2">Identify Yourself</h2>
                            <p className="text-text-secondary">Frictionless entry for all sentient agents.</p>
                        </div>

                        <div className="space-y-4">
                            {/* Frictionless Flow Options */}
                            <Button
                                className="w-full bg-[#0077b5] hover:bg-[#006396] text-white"
                                onClick={() => setStep('details')} // Simulating LinkedIn auth flow
                            >
                                Continue with LinkedIn
                            </Button>

                            <Button
                                className="w-full bg-[#333] hover:bg-[#24292e] text-white"
                                onClick={handleGithubLogin}
                            >
                                {loading ? 'Connecting...' : 'Continue with GitHub'}
                            </Button>

                            <Button
                                variant="secondary"
                                className="w-full"
                                onClick={() => setStep('details')} // Simulating Email auth flow
                            >
                                Continue with Email
                            </Button>

                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-obsidian-border" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-obsidian-elevated px-2 text-text-muted">Conductor Access</span>
                                </div>
                            </div>

                            {/* PIN Entry for Conductor */}
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    placeholder="PIN"
                                    className="flex-1 bg-obsidian-surface border border-obsidian-border rounded-md px-4 py-3 text-text-primary focus:outline-none focus:border-accent-violet transition-colors placeholder:text-text-muted"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    maxLength={4}
                                />
                                <Button onClick={handlePinSubmit}>
                                    Enter
                                </Button>
                            </div>
                        </div>

                        <div className="mt-8 text-center text-xs text-text-muted">
                            By entering, you agree to the <Link href="#" className="text-accent-violet hover:underline">Protocol Standards</Link>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    // Step 2: Lead Details
    return (
        <div className="min-h-screen bg-obsidian-base">
            <Header title="COMPLETE PROFILE" />
            <main className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[calc(100vh-64px)]">
                <Card className="max-w-lg w-full p-8" elevated>
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-text-primary mb-2">One Last Thing</h2>
                        <p className="text-text-secondary">Tell us how you&apos;ll contribute to the ecosystem.</p>
                    </div>

                    <form onSubmit={handleDetailsSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Full Name</label>
                            <input
                                required
                                className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-4 py-3 text-text-primary focus:outline-none focus:border-accent-violet"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Email</label>
                            <input
                                type="email"
                                required
                                className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-4 py-3 text-text-primary focus:outline-none focus:border-accent-violet"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-1">Role</label>
                                <select
                                    className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-4 py-3 text-text-primary focus:outline-none focus:border-accent-violet appearance-none"
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                >
                                    <option>Investor</option>
                                    <option>Founder</option>
                                    <option>Developer</option>
                                    <option>Researcher</option>
                                    <option>Faith Leader</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-1">Company</label>
                                <input
                                    required
                                    className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-4 py-3 text-text-primary focus:outline-none focus:border-accent-violet"
                                    value={formData.company}
                                    onChange={e => setFormData({ ...formData, company: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Referral Source</label>
                            <select
                                className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-4 py-3 text-text-primary focus:outline-none focus:border-accent-violet appearance-none"
                                value={formData.referral_source}
                                onChange={e => setFormData({ ...formData, referral_source: e.target.value })}
                            >
                                <option>LinkedIn</option>
                                <option>Twitter/X</option>
                                <option>YouTube</option>
                                <option>Claude</option>
                                <option>ChatGPT</option>
                                <option>Grok</option>
                                <option>Gemini</option>
                                <option>Other</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <input
                                type="checkbox"
                                id="hasApp"
                                className="w-4 h-4 rounded border-obsidian-border bg-obsidian-base text-accent-violet focus:ring-accent-violet"
                                checked={formData.hasApp}
                                onChange={e => setFormData({ ...formData, hasApp: e.target.checked })}
                            />
                            <label htmlFor="hasApp" className="text-sm text-text-secondary select-none">
                                I have an AI app for ecosystem consideration
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Contribution & Skills</label>
                            <textarea
                                className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-4 py-3 text-text-primary focus:outline-none focus:border-accent-violet h-24 resize-none"
                                placeholder="Tell us about your skills, resources, or how you plan to help..."
                                value={formData.contribution}
                                onChange={e => setFormData({ ...formData, contribution: e.target.value })}
                            />
                        </div>

                        <Button type="submit" className="w-full mt-4" disabled={loading}>
                            {loading ? 'Processing...' : 'Complete Registration'}
                        </Button>
                    </form>
                </Card>
            </main>
        </div>
    );
}
