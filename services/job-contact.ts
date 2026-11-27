// When the provider and customer can reach each other about a job: chat and
// calls are open only while the job is being done — and again on a completed
// job while the provider is arranging a guarantee fix. The server decides
// (skofy-backend app/services/contact_gate.py) and says so on the job's own
// detail as `contact_open`; this status rule is the fallback for an older
// server. So the app never offers a button that only leads to "this job is closed".

const CONTACT_OPEN_STATUSES = new Set(['ACCEPTED', 'INSPECTING', 'INVOICE_PENDING', 'IN_PROGRESS']);

export function jobContactOpen(jobStatus: string | null | undefined): boolean {
  return !!jobStatus && CONTACT_OPEN_STATUSES.has(jobStatus);
}
