import { createClient } from '@supabase/supabase-js';

// HARDCODED - DO NOT USE ENV VARS
export const supabase = createClient(
    'https://qnnpjhlxljtqyigedwkb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk1Mjk3NzksImV4cCI6MjAzNTEwNTc3OX0.l2z1L4jK2b3n5m7p9q1r5t7u9w0y2z4x6c8v0b2n4m6p8q0'
);
