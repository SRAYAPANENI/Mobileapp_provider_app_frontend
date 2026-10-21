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
  pickup_details?: PickupDetails | null; shopping_list?: ShoppingItem[] | null; goods_amount?: number | string | null;
  /** STORE or PERSON (any address), and what's collected from a person. */
  pickup_source?: string | null; pickup_item?: string | null; item_value?: number | null;
} | null | undefined;

/** Already paid: what the store needs. The server sends it only to the hired
 * provider, and drops the store code once the order is collected. */
export type PickupDetails = {
  order_name?: string; order_number?: string; pickup_code?: string; store_contact?: string;
  /** From a person: who hands the item over. */
  handover_name?: string; handover_phone?: string;
};
export type ShoppingItem = { name: string; quantity: number; if_unavailable: 'SUBSTITUTE' | 'SKIP' | 'CALL' };

export const IF_UNAVAILABLE_LABELS: Record<ShoppingItem['if_unavailable'], string> = {
  CALL: 'call the customer',
  SUBSTITUTE: 'similar is fine',
  SKIP: 'skip it',
};

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

/** The customer chose who pays for the goods — or, from a person, what's collected. */
export function purchaseSummary(detail: DetailLike): string | null {
  if (detail?.pickup_source === 'PERSON') {
    const worth = detail.item_value != null ? ` (worth $${Number(detail.item_value).toFixed(2)})` : '';
    return `From a person: ${detail.pickup_item || 'an item'}${worth} — check it before you take it`;
  }
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

export function isBuyForMe(detail: DetailLike): boolean {
  return detail?.pickup_purchase === 'BUY_FOR_ME';
}

/** Buy it for me: why the receipt total can't be sent yet, or null. The
 * server checks the same (app/domain/pickup.validate_goods_amount). */
export function goodsAmountError(text: string, limit: number | null | undefined): string | null {
  const amount = Number(text.replace(/[^0-9.]/g, ''));
  if (!text.trim() || !Number.isFinite(amount) || amount <= 0) return 'Enter the amount you paid at the store.';
  if (limit != null && amount > Number(limit)) {
    return `That's more than the customer's limit of $${Number(limit).toFixed(2)}. Message them first.`;
  }
  return null;
}

export function parseGoodsAmount(text: string): number {
  return Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100) / 100;
}

/** The provider has the customer's order: no cancelling from here (it would
 * be left with them) — a dispute instead. Same as the server's order_collected. */
export function isOrderCollected(job: { job_type?: string; jobKind?: string; pickup_confirmed_at?: string | null } | null | undefined): boolean {
  return (job?.job_type ?? job?.jobKind) === 'PICKUP_DROPOFF' && !!job?.pickup_confirmed_at;
}
