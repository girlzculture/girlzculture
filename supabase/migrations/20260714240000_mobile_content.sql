-- Editable How It Works FAQs used by the compact mobile-first public page.
insert into public.content_pages (slug, title, eyebrow, hero_title, hero_subtitle, sections, status)
values (
  'how-it-works',
  'How It Works',
  'How booking works',
  'Book with clear steps and real confirmation.',
  'Find, compare, book, and receive confirmation without guesswork.',
  '[{"title":"How much is the deposit?","body":"We require a 10% reservation deposit to secure your appointment. The remaining balance is paid directly at the salon after your service."},{"title":"When do I pay the balance?","body":"You pay the remaining balance directly to the salon after your appointment."},{"title":"Are salons vetted?","body":"Yes. Salons are reviewed for identity, licensing, safety, and professional standards."},{"title":"Can I reschedule my appointment?","body":"Yes, subject to the salon cancellation and rescheduling policy."}]'::jsonb,
  'Published'
)
on conflict (slug) do nothing;
