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

## Daily flow

1. **Warehouse**: Print label → paste on box → pick rider → scan boxes into the handover → Confirm handover.
2. **Rider**: Scan parcel QR → Start ride → **Delivered** (handover photo) or **Can't deliver**
   (reason + 2 calls from the app + doorstep photo + within 300 m of the address).
3. **Warehouse**: scan returned boxes to check them in; scan the rider's cash code to record the deposit.
4. **Admin**: daily numbers, return rate per rider vs team, flagged returns with evidence and a decision.

## Settings

| What | Where |
| --- | --- |
| Return rules (calls, distance, photo, block or flag) and cash limit | `lib/rules.ts` |
| Require the customer's SMS code on delivery (needs an SMS provider) | `NEXT_PUBLIC_REQUIRE_OTP=true` |
| Warehouse phone on the rider profile | `NEXT_PUBLIC_DESK_PHONE` |
| Colours | `app/globals.css` |

Phones need location and camera permission. Both only work over HTTPS, which Vercel provides.
For testing on a phone before deploying: `npm run dev:phone` and open `https://<your-PC-IP>:3000`.

## Not done yet

- SMS to customers (delivery code, "did the rider visit?"). Needs an SMS provider.
- Marking the Shopify order fulfilled on delivery. Needs a Shopify Admin API token.
- Doorstep photos are stored inside the parcel record (small JPEGs). Move to Supabase Storage if volume grows.
- Status changes are checked in the app; a rider with technical skill could still edit their own parcels through the API.
  Moving the rules into database functions closes that gap.
