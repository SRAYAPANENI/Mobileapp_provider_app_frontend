// Fair Cap on the provider's side — the numbers the app shows before the
// server checks them (skofy-backend app/domain/fees.py, MIN_VISITING_FEE).

/** Every trip to a customer carries at least this visiting fee — it covers
 * the trip when a customer cancels after the provider set off. */
export const MIN_VISITING_FEE = 15;
