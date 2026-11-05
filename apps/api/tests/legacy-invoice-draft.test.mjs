import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLegacyDraft,financialYear,documentType} from '../dist/modules/tenancy/legacy-invoice-draft.js';
const draft={
 id:'INV/2026-27/0001',invoiceNumber:'INV/2026-27/0001',invoiceDate:'2026-11-05',
 invoiceType:'tax-invoice',currency:'INR',status:'draft',clientName:'Sample',
 data:{details:{invoiceNumber:'INV/2026-27/0001'},
 items:[{id:'1',name:'Test product',quantity:2,rate:100,taxPercent:18}],
 totals:{total:236,igst:36}}
};
test('original fork invoice draft shape remains preserved',()=>{
 assert.equal(documentType('tax-invoice'),'tax_invoice');
 assert.equal(documentType('credit-note'),'credit_note');
 assert.equal(financialYear('2026-03-31'),'2025-26');
 assert.equal(financialYear('2026-04-01'),'2026-27');
 const valid=validateLegacyDraft(draft);
 assert.equal(valid.id,draft.id);
 assert.equal(valid.data.items[0].taxPercent,18);
});
test('refuse unsupported invoice status and do not infer statutory validity',()=>{
 for(const status of ['issued','paid','unpaid','cancelled','void'])
   assert.throws(()=>validateLegacyDraft({...draft,status}));
 assert.throws(()=>validateLegacyDraft({...draft,invoiceType:'unknown'}));
});
test('reject malformed dates, numbers and line quantities',()=>{
 assert.throws(()=>validateLegacyDraft({...draft,invoiceDate:'2026-02-31'}));
 assert.throws(()=>validateLegacyDraft({...draft,id:'different'}));
 assert.throws(()=>validateLegacyDraft({...draft,data:{...draft.data,items:[{name:'X',quantity:-1,rate:100}]}}));
 assert.throws(()=>validateLegacyDraft({...draft,data:{...draft.data,items:[]}}));
});
