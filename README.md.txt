# RCG Clocking App

Clock-in / clock-out Progressive Web App for **Redcatch Community Garden (Bristol)**.

The system allows volunteers and staff to safely log presence on site so administrators know who is currently at the garden.

Primary goals:

• Track who is currently on site  
• Allow users to clock in and out  
• Provide an admin live presence dashboard  
• Provide a tablet kiosk mode with PIN login  
• Verify volunteer hours worked  

---

# Tech Stack

Frontend
- Next.js
- React
- TypeScript
- TailwindCSS

Backend
- Supabase
- Postgres
- Row Level Security
- Realtime subscriptions

Deployment
- Vercel

Production URL
- https://rcgclocking.app

---

# Project Structure

The production application lives in `src/` with Supabase migrations and Edge Functions under `supabase/`.
