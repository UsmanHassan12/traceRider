import { QRCodeSVG } from "qrcode.react";
import type { Parcel } from "@/lib/types";
import { pkr } from "@/lib/format";

/** 4 x 6 inch style shipping label. The QR holds the tracking code the rider scans. */
export function LabelSheet({ p }: { p: Parcel }) {
  return (
    <div className="label-sheet">
      <div className="lh">
        <span>RIDER TRACE · COD</span>
        <span className="mono" style={{ fontSize: 14 }}>{p.id}</span>
      </div>
      <div className="lb">
        <QRCodeSVG value={p.trk} size={140} level="M" marginSize={0} />
        <div style={{ fontSize: 13, lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Deliver to</div>
          <b style={{ fontSize: 15 }}>{p.customer}</b>
          <div>{p.address}</div>
          <div>{p.phone}</div>
          <div style={{ marginTop: 8 }}>{p.item}</div>
        </div>
      </div>
      <div className="trk">{p.trk}</div>
      <div className="lf">
        <span>COLLECT {pkr(p.cod).toUpperCase()}</span>
        <span>{new Date(p.createdAt).toLocaleDateString("en-PK")}</span>
      </div>
    </div>
  );
}
