'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function WaitlistForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
         name: data.name,
         email: data.email,
         github_username: data.github_username,
         what_building: data.what_building,
         pain_points: { notes: data.pain_points }
      })
    });
    setSuccess(true);
    setLoading(false);
  }

  if (success) {
      return <Button disabled className="bg-emerald-500 text-white px-8 py-6 rounded-2xl font-black">Success. Watch your inbox.</Button>;
  }

  if (!isOpen) {
      return <Button onClick={() => setIsOpen(true)} className="bg-white text-black hover:bg-zinc-200 px-8 py-6 rounded-2xl font-black transition-all hover:scale-105 active:scale-95">Request Developer Access</Button>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-obsidian-elevated/80 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10 w-full min-w-[320px] text-left animate-in slide-in-from-bottom-4 duration-500 z-50">
       <h4 className="text-white font-bold mb-2">Join the Founding Cohort</h4>
       <input name="name" placeholder="Name" required className="bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-violet-500 outline-none transition-all" />
       <input name="email" type="email" placeholder="Email Address" required className="bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-violet-500 outline-none transition-all" />
       <input name="github_username" placeholder="GitHub Username" className="bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-violet-500 outline-none transition-all" />
       <textarea name="what_building" placeholder="What are you building?" className="bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-violet-500 outline-none transition-all min-h-[80px]" />
       <textarea name="pain_points" placeholder="Current pain points in AI?" className="bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-violet-500 outline-none transition-all min-h-[80px]" />
       <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-500 text-white py-4 rounded-xl font-bold border-0 mt-2">
         {loading ? 'Encrypting...' : 'Secure My Spot'}
       </Button>
    </form>
  );
}
