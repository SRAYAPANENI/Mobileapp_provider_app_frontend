// Pickup & Drop on the provider's side — the rules, with no UI.
// The server applies the same ones (skofy-backend app/domain/pickup.py).

type JobLike = {
  jobKind?: string; status?: string; latitude?: number | null; longitude?: number | null;
  dropoffLatitude?: number | null; dropoffLongitude?: number | null; title?: string;
};
type DetailLike = {
  pickup_confirmed_at?: string | null; delivered_at?: string | null;
  pickup_purchase?: string | null; purchase_limit?: number | null;
  dropoff_address?: string | null; dropoff_notes?: string | null;
} | null | undefined;

export function isDelivery(job: JobLike | null | undefined): boolean {
  return job?.jobKind === 'PICKUP_DROPOFF';
}

/** Collected from the store (the photo was taken, or the customer has paid). */
export function isCollected(job: JobLike, detail: DetailLike): boolean {
  return !!detail?.pickup_confirmed_at || job.status === 'IN_PROGRESS';
}

/** Where "Navigate" should go: the store, then — once collected — the drop-off.
 * It used to go to the store for the whole job. */
export function navigationTarget(job: JobLike, detail: DetailLike): { lat: number; lng: number; title: string } | null {
  if (isDelivery(job) && isCollected(job, detail) && job.dropoffLatitude != null && job.dropoffLongitude != null) {
    return { lat: job.dropoffLatitude, lng: job.dropoffLongitude, title: 'Drop-off' };
  }
  if (job.latitude == null || job.longitude == null) return null;
  return { lat: job.latitude, lng: job.longitude, title: job.title ?? 'Job Site' };
}

/** The customer chose who pays for the goods. */
export function purchaseSummary(detail: DetailLike): string | null {
  if (!detail?.pickup_purchase) return null;
  if (detail.pickup_purchase === 'BUY_FOR_ME') {
    return detail.purchase_limit != null
      ? `Buy it for the customer — up to $${Number(detail.purchase_limit).toFixed(2)} on items`
      : 'Buy it for the customer';
  }
  return 'Already paid — just collect it';
}

/** Has the customer's drop-off code been entered? Then it can be completed. */
export function isDelivered(detail: DetailLike): boolean {
  return !!detail?.delivered_at;
}
