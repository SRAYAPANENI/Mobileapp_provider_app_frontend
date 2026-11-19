import React, { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { showDialog } from '@/components/alert-host';
import { KeepPreview } from '@/components/keep-preview';
import { LabourHelper } from '@/components/labour-helper';
import { ThemedText } from '@/components/themed-text';
import { SkoFyApi } from '@/services/api';
import { roomStyles as s } from './styles';

// The provider's invoice to the customer: the parts or items, the amount, what
// part is paid when work starts, and a note. One form for the three moments a
// job is invoiced — it was written out three times, and the copies had drifted.
//
//  - 'remote':    an online job, invoiced when ready (no visit to check).
//  - 'inspected': after the on-site inspection.
//  - 'pickup':    a quoted pickup, once collected. Buying for the customer,
//                 the items come back from their held money, so only the
//                 delivery charge is asked — no item lines.
//
// Its state is its own: typing here redraws only this form.

export type InvoiceKind = 'remote' | 'inspected' | 'pickup';

type Line = { name: string; quantity: string; unit_cost: string };

const WORDS: Record<InvoiceKind, { line: string; add: string; notes: string }> = {
  remote: { line: 'Material', add: '+ Add Material', notes: 'What did you do? (optional)' },
  inspected: { line: 'Material', add: '+ Add Material', notes: 'What did you inspect? (optional)' },
  pickup: { line: 'Item', add: '+ Add Item', notes: 'What did you do? (optional)' },
};

export function InvoiceForm({ jobId, kind, buyingForCustomer = false, onSent }: {
  jobId: string;
  kind: InvoiceKind;
  buyingForCustomer?: boolean;
  /** Sent: the room reads the job again (it's INVOICE_PENDING now). */
  onSent: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [depositPercent, setDepositPercent] = useState(0);
  const [sending, setSending] = useState(false);
  const words = WORDS[kind];
  const withLines = !(kind === 'pickup' && buyingForCustomer);
  // What the listed parts cost — a small quote can have them paid when work starts.
  const partsTotal = lines.reduce((sum, m) => sum + (parseFloat(m.quantity) || 0) * (parseFloat(m.unit_cost) || 0), 0);
  const setLine = (idx: number, key: keyof Line, value: string) =>
    setLines((prev) => prev.map((m, i) => (i === idx ? { ...m, [key]: value } : m)));

  const send = async () => {
    const value = parseFloat(amount);
    if (!amount.trim() || isNaN(value) || value <= 0) {
      showDialog('Invalid Amount', 'Enter a valid invoice amount greater than 0.', undefined, { type: 'error' });
      return;
    }
    setSending(true);
    try {
      const materialLines = (withLines ? lines : [])
        .filter((m) => m.name.trim())
        .map((m) => ({ name: m.name.trim(), quantity: parseFloat(m.quantity) || 1, unit_cost: parseFloat(m.unit_cost) || 0 }));
      await SkoFyApi.jobs.raiseInvoice(jobId, value, materialLines, notes.trim() || undefined, depositPercent);
      setLines([]); setAmount(''); setNotes(''); setDepositPercent(0);
      onSent();
    } catch (err: any) {
      showDialog('Failed to Send Invoice', err?.message ?? 'Please try again.', undefined, { type: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <View>
      {withLines && lines.map((m, idx) => (
        <View key={idx} style={s.row}>
          <TextInput
            style={[s.input, { flex: 2 }]}
            placeholder={words.line}
            placeholderTextColor="#9CA3AF"
            value={m.name}
            onChangeText={(v) => setLine(idx, 'name', v)}
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Qty"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={m.quantity}
            onChangeText={(v) => setLine(idx, 'quantity', v)}
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="$/ea"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={m.unit_cost}
            onChangeText={(v) => setLine(idx, 'unit_cost', v)}
          />
        </View>
      ))}
      {withLines && (
        <TouchableOpacity style={s.addRowBtn} onPress={() => setLines((prev) => [...prev, { name: '', quantity: '', unit_cost: '' }])}>
          <ThemedText style={s.addRowBtnText}>{words.add}</ThemedText>
        </TouchableOpacity>
      )}
      {/* Labour by the hour — for work, not a trip's delivery charge. */}
      {kind !== 'pickup' && <LabourHelper partsTotal={partsTotal} onUse={setAmount} />}
      <TextInput
        style={[s.input, s.inputBig]}
        placeholder={buyingForCustomer ? 'Delivery charge ($)' : 'Invoice amount ($)'}
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <KeepPreview
        jobId={jobId}
        amount={parseFloat(amount) || 0}
        partsTotal={partsTotal}
        depositPercent={depositPercent}
        onDepositChange={setDepositPercent}
      />
      <TextInput
        style={s.input}
        placeholder={words.notes}
        placeholderTextColor="#9CA3AF"
        value={notes}
        onChangeText={setNotes}
      />
      <TouchableOpacity style={[s.primaryBtn, sending && { opacity: 0.7 }]} onPress={send} disabled={sending}>
        <ThemedText style={s.primaryBtnText}>{sending ? 'Sending…' : 'Send Invoice'}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}
