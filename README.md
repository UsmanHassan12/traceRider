# Rider Trace

Shopify-connected rider delivery tracking: QR labels at the warehouse, rider scan-to-start rides,
delivered / returned with proof, and an admin dashboard for daily tracking and return review.

Next.js 15 (App Router) + React 19 + TypeScript, with Supabase for the database, logins and live updates.
Deploys to Vercel.

---

## 1. Set up Supabase (about 5 minutes)

1. In Supabase, create a **New project** (pick the Mumbai or Singapore region, the closest to Pakistan).
2. Open **SQL Editor › New query**, paste everything from `supabase/schema.sql`, and click **Run**.
3. Create your own admin login:
   - **Authentication › Users › Add user › Create new user**: your email + a password, tick **Auto Confirm User**.
   - Back in **SQL Editor**, run (with your email and name):
     ```sql
     insert into public.staff (user_id, role, name)
     select id, 'admin', 'Your Name' from auth.users where email = 'you@example.com';
     ```
4. Open **Project Settings › API** (or **API Keys**) and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role / secret key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret)

## 2. Run it on your computer

```bash
npm install
copy .env.example .env.local     # Windows (use cp on Mac/Linux), then fill in the values
npm run dev
```

Open http://localhost:3000, sign in with your admin email, and you land on the admin dashboard.

Run `npm run build` once before deploying. If it shows errors, fix them first: Vercel runs the same build.

## 3. Deploy on Vercel

1. Push this folder to GitHub.
2. In Vercel: **Add New › Project**, import the GitHub repo. Framework is detected as Next.js.
3. Before clicking Deploy, open **Environment Variables** and add the values from `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SHOPIFY_WEBHOOK_SECRET` once you have it).
4. Deploy. Every push to GitHub redeploys automatically.
5. In Supabase **Authentication › URL Configuration**, set **Site URL** to your Vercel address.

If you change an environment variable later, redeploy (Deployments › … › Redeploy) so the new value is used.

## 4. Add your team

Admin › **Staff & riders** › *Add a login*. Pick the role:

| Role | Signs in to | Can do |
| --- | --- | --- |
| Rider | `/rider` (phone) | Scan parcels handed to them, deliver, return with proof, cash |
| Warehouse desk | `/warehouse` | Print labels, hand over to riders, check returns in, receive cash |
| Admin | `/admin` | Everything, plus staff and return reviews |

Everyone signs in at `/login`. A rider only ever sees parcels handed to them.

To show the dashboard before real orders arrive, use **Load sample day** on the same page.
**Remove sample data** deletes only the sample records.

## 5. Connect Shopify

1. Shopify admin › **Settings › Notifications › Webhooks › Create webhook**
   - Event: **Order creation** · Format: **JSON**
   - URL: `https://<your-app>.vercel.app/api/shopify/webhook`
2. Copy the signing secret shown under the webhooks list into `SHOPIFY_WEBHOOK_SECRET` on Vercel and redeploy.
3. Place a test order. It appears on the warehouse desk under **Print label** within seconds.

COD amount = the order's outstanding amount (0 for prepaid orders). The map pin comes from the shipping address
when Shopify has one; without it the location check is skipped and noted on the parcel.

### Only confirmed orders from Islamabad and Rawalpindi

- An order comes into the app only when it has the **`order_confirmed`** tag (setting `SHOPIFY_CONFIRMED_TAG`)
  and ships to **Islamabad or Rawalpindi** (setting `ALLOWED_CITIES`). Everything else is ignored.
- The tag is usually added after the COD confirmation call, so also create **Order update** and
  **Order cancellation** webhooks (same URL). An order cancelled before handover is removed from the warehouse list.

### Mark Shopify orders fulfilled at handover

1. Supabase › SQL Editor: run `supabase/migrations/002_shopify_sync.sql` once.
2. Dev Dashboard › your app › **Versions**: scopes `read_orders`, `read_merchant_managed_fulfillment_orders`,
   `write_merchant_managed_fulfillment_orders` → release → install / update on the store.
3. Vercel env: `SHOPIFY_STORE_DOMAIN` (xxx.myshopify.com), `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` → Redeploy.
4. When the warehouse confirms a handover, each Shopify order is fulfilled with the parcel code as tracking number.
   Failures show on the warehouse desk and in Admin › Orders with a **Retry Shopify** button.

### Database updates (run each once, in order, in Supabase › SQL Editor)

| File | What it adds |
| --- | --- |
| `supabase/migrations/002_shopify_sync.sql` | Shopify fulfillment status on each parcel |
| `supabase/migrations/003_proof_photos.sql` | Private `proof` storage bucket for doorstep photos |
| `supabase/migrations/004_cash_handover.sql` | Two-sided cash handover: rider's declared amount, one-time QR, accept / dispute |
| `supabase/migrations/005_archive.sql` | **Archived** status: orders not delivered within 7 days move to Admin › Archive every night |

Open the file, copy everything inside it, paste into a new query and Run (don't paste the file name).

## Daily flow

1. **Warehouse › Dispatch**: Print label → paste on box → in *Ready to hand over*, pick a rider in the dropdown → **Assign**
   (or tick several and assign together, or scan boxes into the handover on the right).
2. **Rider › Pick up**: scan every box assigned to him. Scanning only confirms he has the box.
3. **Rider › Home**: all his parcels in delivery order (nearest first). Tap **Start delivery** on a parcel when he sets off;
   it moves to **Live rides**. Then **Delivered** (handover photo) or **Can't deliver** (reason + 2 calls + doorstep photo).
4. **Warehouse › Returns**: scan returned boxes to check them in; see each return's reason and proof, and the track record by date.
5. **Warehouse › Cash**: scan the rider's cash QR and count the notes. Pick a date to see cash on any past day.
6. **Admin**: daily numbers, return rate per rider vs team, flagged returns, and **Export CSV** for any date range.

## Archive

An order that is still not delivered 7 days after it arrived (needs label, ready, with a rider, or out for delivery)
moves to **Admin › Archive**. The database does this every night at 2:00 am, and the app also does it whenever an admin
or the warehouse desk opens it. Archived orders leave the warehouse desk, the rider's phone and Orders, but nothing is
deleted: **Restore** puts an order back where it was, with another 7 days. Returned orders are never archived.

## Settings

| What | Where |
| --- | --- |
| Return rules (calls, distance, photo, block or flag) and cash limit | `lib/rules.ts` |
| Require the customer's SMS code on delivery (needs an SMS provider) | `NEXT_PUBLIC_REQUIRE_OTP=true` |
| Warehouse phone on the rider profile | `NEXT_PUBLIC_DESK_PHONE` |
| Warehouse location for the rider's delivery order (nearest first, farthest last) | `NEXT_PUBLIC_WAREHOUSE_LAT`, `NEXT_PUBLIC_WAREHOUSE_LNG` |
| Colours | `app/globals.css` |

Phones need location and camera permission. Both only work over HTTPS, which Vercel provides.
For testing on a phone before deploying: `npm run dev:phone` and open `https://<your-PC-IP>:3000`.

## Not done yet

- SMS to customers (delivery code, "did the rider visit?"). Needs an SMS provider.
- Marking the Shopify order fulfilled on delivery. Needs a Shopify Admin API token.
- Doorstep photos are stored inside the parcel record (small JPEGs). Move to Supabase Storage if volume grows.
- Status changes are checked in the app; a rider with technical skill could still edit their own parcels through the API.
  Moving the rules into database functions closes that gap.
