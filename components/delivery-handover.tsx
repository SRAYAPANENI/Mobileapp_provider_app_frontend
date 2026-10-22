import { CodeHandoverForm } from '@/components/code-handover-form';
import { SkoFyApi } from '@/services/api';
import React from 'react';

// Handing back what the customer is waiting for: a Pickup & Drop order at the
// drop-off, or what was left in your care (kind "care"). Ask for the
// customer's code, enter it there, done — the server checks the code and
// that the phone is at the right place (app/services/delivery_service.py).
export function DeliveryHandover({ jobId, onDelivered, recipientName, kind = 'delivery' }: {
  jobId: string; onDelivered: () => void;
  /** Sent by the customer: who receives it — the customer sends them the code. */
  recipientName?: string | null;
  kind?: 'delivery' | 'care';
}) {
  const care = kind === 'care';
  return (
    <CodeHandoverForm
      title={care ? 'Hand it back' : 'Hand over the order'}
      body={care
        ? "When the customer collects it (or you're done at their place), ask for the 4-digit code on their screen."
        : recipientName
          ? `At the drop-off, tap below — the customer sends ${recipientName} a 4-digit code. Ask ${recipientName} for it.`
          : 'At the drop-off, ask the customer for the 4-digit code on their screen.'}
      requestLabel={care ? 'Ask for the hand-back code' : 'Ask for the drop-off code'}
      confirmLabel={care ? 'Confirm hand-back' : 'Confirm delivery'}
      requestedMessage={recipientName
        ? `The customer is sending ${recipientName} a 4-digit code. Ask ${recipientName} for it.`
        : `The customer now sees a 4-digit ${care ? 'hand-back' : 'drop-off'} code in their app.`}
      placeName={care ? 'the hand-back place' : 'the drop-off'}
      onRequest={() => SkoFyApi.jobs.requestDeliveryCode(jobId)}
      onVerify={(code, lat, lng) => SkoFyApi.jobs.verifyDeliveryCode(jobId, code, lat, lng)}
      onDone={onDelivered}
    />
  );
}
