# Rider Trace

Front end for the Shopify rider tracking PWA: QR labels at the warehouse, rider scan-to-start rides,
delivered / returned with proof, and an admin dashboard for daily tracking and return review.

Built with Next.js 15 (App Router), React 19 and TypeScript. No database yet: everything runs on sample
data kept in the browser's localStorage, so you can demo the whole flow today.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick a role:

| Screen | URL |
| --- | --- |
| Rider app (phone) | `/rider` (signs in at `/rider/login`) |
| Warehouse dispatch desk | `/warehouse` |
| Admin overview | `/admin` |
| Return review | `/admin/review` |

Demo sign-in: on the rider login, open "Demo rider numbers", tap one (Bilal Ahmed is 3001234471), send the code,
and type any 6 digits.

### Try it on a phone

The camera only works over HTTPS. Run:

```bash
npm run dev:phone
```

Then open `https://<your-computer's-IP>:3000/rider` on a phone on the same Wi-Fi and accept the certificate warning.
You can also install it to the home screen (it ships a PWA manifest).

## Try the full flow

1. **Warehouse** (`/warehouse`): click *Sync Shopify*, *Print label* on an order, then *Label printed and pasted*.
   Pick **Bilal Ahmed** on the right, type the tracking code (e.g. `RT1230-...`) in the scan box or click *Add to handover*,
   then *Confirm handover*.
2. **Rider** (`/rider`, signed in as Bilal, in another tab of the same browser): *Scan parcel QR*. Point the camera at the
   label on the warehouse screen, or tap *Label damaged? Type the code instead*. Start the ride.
3. On the ride, tap **Delivered** (the demo shows the customer's code) or **Can't deliver**. A return only saves when it has
   a reason, 2 logged calls, a doorstep photo, and the rider within 300 m of the address. Demo mode adds a slider to fake the distance.
4. **Admin** (`/admin`): the day's numbers, return rate per rider against the team, reasons, custody counts, and
   *Returns review* with evidence and a decision for each flagged return.

*Reset demo data* on the warehouse screen restores the sample day.

## Where to change things

| What | File |
| --- | --- |
| Return rules (calls, distance, photo, block or flag) and cash limit | `lib/rules.ts` |
| Sample riders, areas and the sample day | `lib/seed.ts` |
| All actions (handover, start ride, deliver, return, review) | `lib/store.tsx` |
| Colours and shared styles | `app/globals.css` |

Set `NEXT_PUBLIC_DEMO=false` in `.env.local` to hide demo helpers (OTP hints, distance slider, rider numbers) and use real GPS.

## Next steps for production

- Replace `lib/store.tsx` actions with calls to a real API and database (orders, parcels, custody events, riders).
- Shopify: an `orders/create` webhook to create parcels, and mark orders fulfilled on delivery.
- SMS: send the customer delivery code and the "did the rider visit?" message (e.g. through a local SMS gateway).
- Real sign-in: SMS OTP plus device binding and the shift selfie.
- Store doorstep photos in object storage instead of the browser.
